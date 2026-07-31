-- ============================================================================
-- NZ Suburb Intelligence — Geocoding + live-commute cache
-- (migration 0007, TRI-44/TRI-47/TRI-50)
--
-- Decision records:
--  * addresses (TRI-44): LINZ NZ Addresses, full Auckland clip (~600k rows —
--    locked 2026-07-31; size checked against the free tier at load). No anon
--    table read: the ONLY public surface is geocode_address() below — same
--    narrow-gate pattern as 0004's similarity functions. pg_trgm word-
--    similarity handles partial + misspelled input ("42 ponsonby rd").
--  * geocode_address (TRI-47): SECURITY DEFINER, hard LIMIT, similarity
--    scores returned so the API can refuse honestly below threshold rather
--    than guess. Confidence policy lives in the route, not here.
--  * commute_cache (TRI-50): keyed origin/destination/mode; TTL = indefinite
--    (decision 2026-07-31 — roads rarely change; anchor ETL re-runs handle
--    drift). Only REAL routed results are cached — fallback/straight-line
--    results must never stick forever. Write path is commute_cache_put(),
--    SECURITY DEFINER with strict validation: the server route is the only
--    intended caller, but the anon key could invoke it directly, so it
--    validates key shapes, mode whitelist, and sane bounds; C5's rate limit
--    caps abuse volume. Accepted residual risk for a public demo: a hostile
--    caller could seed plausible-but-wrong times for arbitrary point pairs.
-- ============================================================================

create extension if not exists pg_trgm;

-- --------------------------------------------------------------------------
-- Addresses — LINZ NZ Addresses, Auckland clip (loaded by TRI-44 ETL)
-- --------------------------------------------------------------------------
create table addresses (
  id              bigint generated always as identity primary key,
  linz_id         bigint not null unique,          -- LINZ address_id (upsert key)
  full_address    text   not null,
  suburb_locality text,
  town_city       text,
  lng             double precision not null,
  lat             double precision not null,
  sa2_code        text                             -- spatial join at load; null = outside SA2 set
);

create index addresses_trgm_idx on addresses using gin (full_address gin_trgm_ops);
create index addresses_sa2_idx  on addresses (sa2_code);

alter table addresses enable row level security;   -- no policies: geocode_address() is the gate

-- --------------------------------------------------------------------------
-- Geocoding gate — fuzzy match, scores exposed, never guesses silently
-- --------------------------------------------------------------------------
create or replace function geocode_address(p_query text, p_limit int default 5)
returns table (
  full_address    text,
  suburb_locality text,
  town_city       text,
  lng             double precision,
  lat             double precision,
  sa2_code        text,
  sa2_name        text,
  score           real
)
language sql
stable
security definer
set search_path = public
as $$
  select a.full_address,
         a.suburb_locality,
         a.town_city,
         a.lng,
         a.lat,
         a.sa2_code,
         g.name as sa2_name,
         greatest(word_similarity(lower(p_query), lower(a.full_address)),
                  similarity(lower(p_query), lower(a.full_address))) as score
  from addresses a
  left join geographies g on g.sa2_code = a.sa2_code and g.geo_type = 'SA2'
  where lower(p_query) <% lower(a.full_address)
  order by score desc, a.full_address
  limit least(greatest(p_limit, 1), 10);
$$;

grant execute on function geocode_address(text, int) to anon, authenticated;

-- --------------------------------------------------------------------------
-- Live-commute cache — read/write only through the two functions below
-- --------------------------------------------------------------------------
create table commute_cache (
  id           bigint generated always as identity primary key,
  origin_key   text not null,                      -- 'sa2:129700' | 'pt:174.76910,-36.84420'
  dest_key     text not null,
  mode         text not null,
  duration_s   numeric not null,
  distance_m   numeric not null,
  provider     text not null default 'ors',
  retrieved_at timestamptz not null default now(),
  unique (origin_key, dest_key, mode)
);

alter table commute_cache enable row level security;  -- no policies: functions are the gate

create or replace function commute_cache_get(p_origin text, p_dest text, p_mode text)
returns table (duration_s numeric, distance_m numeric, provider text, retrieved_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.duration_s, c.distance_m, c.provider, c.retrieved_at
  from commute_cache c
  where c.origin_key = p_origin and c.dest_key = p_dest and c.mode = p_mode;
$$;

create or replace function commute_cache_put(
  p_origin text, p_dest text, p_mode text, p_duration_s numeric, p_distance_m numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_origin !~ '^(sa2:[0-9]{6,7}|pt:-?[0-9]{1,3}\.[0-9]{1,6},-?[0-9]{1,3}\.[0-9]{1,6})$'
     or p_dest !~ '^(sa2:[0-9]{6,7}|pt:-?[0-9]{1,3}\.[0-9]{1,6},-?[0-9]{1,3}\.[0-9]{1,6})$' then
    raise exception 'invalid cache key';
  end if;
  if p_mode not in ('driving-car', 'cycling-regular', 'foot-walking') then
    raise exception 'invalid mode';
  end if;
  if p_duration_s is null or p_duration_s < 0 or p_duration_s > 86400
     or p_distance_m is null or p_distance_m < 0 or p_distance_m > 1000000 then
    raise exception 'out-of-bounds commute result';
  end if;
  insert into commute_cache (origin_key, dest_key, mode, duration_s, distance_m)
  values (p_origin, p_dest, p_mode, p_duration_s, p_distance_m)
  on conflict (origin_key, dest_key, mode) do update
    set duration_s = excluded.duration_s, distance_m = excluded.distance_m,
        retrieved_at = now();
end;
$$;

grant execute on function commute_cache_get(text, text, text) to anon, authenticated;
grant execute on function commute_cache_put(text, text, text, numeric, numeric) to anon, authenticated;
