-- ============================================================================
-- NZ Suburb Intelligence — LINZ suburbs and the suburb ↔ SA2 overlap (migration
-- 0010, TRI-121)
--
-- Decisions:
--   * The SA2 stays the spine. `suburbs` is a NAME layer: LINZ NZ Suburbs and
--     Localities (layer 113764, CC BY 4.0) for the Auckland TA, suburb +
--     locality types only. It exists so "Grey Lynn" can resolve to the SA2s
--     it covers; no metric ever attaches to a suburb row.
--   * `suburb_sa2` stores BOTH shares (of the SA2, of the suburb), computed
--     offline from the generalised polygons (scripts/etl/tri-121-suburbs.mjs),
--     thresholded at 0.2 either way so slivers don't attach. Nothing is
--     aggregated across SA2s: a multi-SA2 suburb resolves to a list and the
--     answer cites each area (honesty rule — no synthetic suburb figures).
--   * Public read (public data, same posture as geographies). Resolution
--     goes through resolve_suburb(): pg_trgm similarity over name + aliases,
--     scores exposed so callers can refuse below a threshold rather than
--     guess (geocode_address() precedent, TRI-47).
-- ============================================================================

create table suburbs (
  linz_id             bigint primary key,            -- LINZ layer 113764 id (upsert key)
  name                text    not null,
  name_ascii          text,
  aliases             text[]  not null default '{}',  -- LINZ additional_name, split
  type                text    not null,              -- Suburb | Locality
  major_name          text,                          -- e.g. Auckland (city)
  population_estimate integer,                       -- Stats NZ estimate carried by LINZ
  lng                 double precision,              -- centre of mass (label point)
  lat                 double precision
);
create index suburbs_name_trgm on suburbs using gin (name gin_trgm_ops);

create table suburb_sa2 (
  linz_id      bigint  not null references suburbs(linz_id) on delete cascade,
  sa2_code     text    not null,
  sa2_share    numeric not null,   -- intersection ÷ SA2 area
  suburb_share numeric not null,   -- intersection ÷ suburb area
  primary key (linz_id, sa2_code)
);
create index suburb_sa2_sa2_idx on suburb_sa2 (sa2_code);

alter table suburbs    enable row level security;
alter table suburb_sa2 enable row level security;
create policy "public read" on suburbs    for select to anon, authenticated using (true);
create policy "public read" on suburb_sa2 for select to anon, authenticated using (true);
-- RLS gates rows but PostgREST also needs the role GRANT (the 0001 gotcha):
-- without it anon reads fail 42501 → HTTP 401. Applied live 2026-09-28 (TRI-148).
grant select on suburbs, suburb_sa2 to anon, authenticated;

-- --------------------------------------------------------------------------
-- resolve_suburb — name or alias → the SA2s it covers, best suburb first,
-- SA2s ordered by how much of the suburb they hold. Score is pg_trgm
-- similarity (case-insensitive); callers decide the threshold.
-- --------------------------------------------------------------------------
create or replace function resolve_suburb(p_query text, p_limit int default 3)
returns table (
  linz_id      bigint,
  name         text,
  type         text,
  sa2_code     text,
  sa2_name     text,
  sa2_share    numeric,
  suburb_share numeric,
  score        real
)
language sql
stable
security definer
set search_path = public
as $$
  with hits as (
    select s.linz_id, s.name, s.type,
           greatest(similarity(p_query, s.name),
                    coalesce((select max(similarity(p_query, a)) from unnest(s.aliases) a), 0)) as score
    from suburbs s
    where similarity(p_query, s.name) >= 0.3
       or exists (select 1 from unnest(s.aliases) a where similarity(p_query, a) >= 0.3)
    order by score desc, s.population_estimate desc nulls last
    limit least(greatest(p_limit, 1), 10)
  )
  select h.linz_id, h.name, h.type, m.sa2_code, g.name, m.sa2_share, m.suburb_share, h.score
  from hits h
  join suburb_sa2 m on m.linz_id = h.linz_id
  join geographies g on g.sa2_code = m.sa2_code and g.geo_type = 'SA2' and g.is_active
  order by h.score desc, m.suburb_share desc;
$$;

grant execute on function resolve_suburb(text, int) to anon, authenticated;
