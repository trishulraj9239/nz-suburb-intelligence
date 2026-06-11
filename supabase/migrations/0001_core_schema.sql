-- ============================================================================
-- NZ Suburb Intelligence — Core schema (migration 0001)
-- Paper-reviewed in M1 / TRI-10.  Applied in M2 / TRI-12 (can ride the scaffold session).
-- Target: Supabase Postgres 15+.
--
-- Locked M1 schema decisions (recommendations accepted):
--   1. Split registry/fact: metric_definitions + metric_values (not one `metrics`).
--   2. `unit` lives on metric_definitions (a property of the metric, not each value).
--   3. PostGIS enabled — geography(Point,4326) for centroids + "within X km" distance.
--   4. Amenities modelled as counts in metric_values for v1 (dedicated POI table deferred).
--   5. Breakdowns via a `category` column (long format), not a jsonb blob.
--   6. Embeddings table is STAGED separately (0002) — its vector dimension is verified
--      against Gemini's current embedding model at M2 before the column is created.
-- ============================================================================

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- geographies — the spatial spine (SA2). Coverage = config via region_code:
-- filter to Auckland on this field; expanding to other cities ingests more
-- regions with zero code change. geo_type is a cheap hedge for a future
-- SA1/locality layer; is_active filters ports/airports/water/zero-pop SA2s.
-- ---------------------------------------------------------------------------
create table geographies (
  id            bigint generated always as identity primary key,
  geo_type      text    not null default 'SA2',
  sa2_code      text    not null,                 -- text, not int (preserves leading zeros / version suffixes)
  name          text    not null,
  region_code   text    not null,                 -- the single coverage lever
  region_name   text    not null,
  ta_code       text,
  ta_name       text,
  centroid      geography(Point, 4326),           -- proximity / commute distance
  land_area_km2 numeric,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (geo_type, sa2_code)
);
create index geographies_region_idx   on geographies (region_code);
create index geographies_centroid_idx on geographies using gist (centroid);

-- ---------------------------------------------------------------------------
-- sources — provenance (half the credibility of an official-data product).
-- tier gates future paid data: 1 = free/now, 2 = CV rating valuations, 3 = sale prices.
-- ---------------------------------------------------------------------------
create table sources (
  id          bigint generated always as identity primary key,
  source_key  text not null unique,               -- 'census_2023', 'nzdep_2018', ...
  name        text not null,
  publisher   text not null,
  url         text,
  licence     text,                               -- confirm exact licence per source before publishing
  tier        smallint not null default 1,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- metric_definitions — the registry. Metrics are DATA, not column names, so the
-- UI / percentile bars / renter-buyer weighting all read generically from here.
-- higher_is_better is NULLABLE on purpose: NULL = "there is no better"
-- (deprivation, ethnicity) — the guard that stops the app ever rendering those
-- as a good/bad verdict (UI spec §7 ethics note).
-- ---------------------------------------------------------------------------
create table metric_definitions (
  id               bigint generated always as identity primary key,
  metric_key       text not null unique,          -- 'median_rent_weekly', 'population', 'tenure_pct'
  label            text not null,
  dimension        text not null,                 -- people|housing|schools|deprivation|amenities
  unit             text,                          -- '$/week', 'years', '%', 'count'
  value_type       text not null,                 -- scalar|percentage|breakdown
  higher_is_better boolean,                        -- NULL for deprivation / ethnicity
  description      text,
  display_order    int  not null default 0,
  is_active        boolean not null default true
);

-- ---------------------------------------------------------------------------
-- metric_values — the long-format fact table. One row per (geo, metric, category,
-- date). `category` carries breakdowns (ethnicity group, tenure type) in the same
-- table, query-friendly for the text-to-query agent. `as_of_date` gives the
-- 2018-vs-2023 time-series for free. `unique nulls not distinct` makes scalar rows
-- (category IS NULL) collide as expected → an idempotent upsert key on ETL re-runs.
-- ---------------------------------------------------------------------------
create table metric_values (
  id          bigint generated always as identity primary key,
  geo_id      bigint not null references geographies(id) on delete cascade,
  metric_id   bigint not null references metric_definitions(id),
  category    text,                               -- NULL for scalars; group label for breakdowns
  value_num   numeric,
  value_text  text,                               -- rare; genuinely textual values only
  source_id   bigint not null references sources(id),
  as_of_date  date   not null,
  confidence  text   not null default 'high',     -- high|medium|low
  created_at  timestamptz not null default now(),
  constraint metric_values_unique
    unique nulls not distinct (geo_id, metric_id, category, as_of_date)
);
create index metric_values_metric_idx on metric_values (metric_id);
create index metric_values_geo_idx    on metric_values (geo_id);

-- ---------------------------------------------------------------------------
-- schools — ENTITIES, not metric rows: the UI lists them individually and
-- distance is computed per-query from the suburb centroid. No decile
-- (deprecated ~2023) — authority/roll/type carry the signal.
-- ---------------------------------------------------------------------------
create table schools (
  id          bigint generated always as identity primary key,
  moe_number  text unique,                        -- Ministry of Education school number
  name        text not null,
  geo_id      bigint references geographies(id),
  school_type text,                               -- 'Full Primary', 'Secondary (Y9-15)'…
  authority   text,                               -- 'State', 'State Integrated', 'Private'
  year_levels text,                               -- 'Years 1-8'
  roll        int,
  location    geography(Point, 4326),
  source_id   bigint references sources(id),
  as_of_date  date,
  created_at  timestamptz not null default now()
);
create index schools_geo_idx      on schools (geo_id);
create index schools_location_idx on schools using gist (location);

-- ---------------------------------------------------------------------------
-- RLS — this is public official data, so anon/authenticated may READ the five
-- reference tables. Writes happen only via the service role (ETL + API routes),
-- which bypasses RLS. This is the explicit "open read on these tables" decision
-- on top of the M0 posture (auto-expose OFF, RLS ON).
-- ---------------------------------------------------------------------------
alter table geographies        enable row level security;
alter table sources            enable row level security;
alter table metric_definitions enable row level security;
alter table metric_values      enable row level security;
alter table schools            enable row level security;

create policy "public read" on geographies        for select to anon, authenticated using (true);
create policy "public read" on sources            for select to anon, authenticated using (true);
create policy "public read" on metric_definitions for select to anon, authenticated using (true);
create policy "public read" on metric_values      for select to anon, authenticated using (true);
create policy "public read" on schools            for select to anon, authenticated using (true);

-- RLS policies gate which ROWS are visible, but the anon/authenticated roles also
-- need table-level SELECT privileges for PostgREST to expose these tables. Tables
-- created via raw migration SQL don't inherit Supabase's default grants, so grant
-- them explicitly (applied live as migration `grant_public_read`).
grant select on geographies        to anon, authenticated;
grant select on sources            to anon, authenticated;
grant select on metric_definitions to anon, authenticated;
grant select on metric_values      to anon, authenticated;
grant select on schools            to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Optional seed: the known Tier-1 sources (safe to re-run). Licence left NULL
-- deliberately — confirm each source's exact licence before publishing, since
-- "responsible data use" is part of this project's whole point.
-- ---------------------------------------------------------------------------
insert into sources (source_key, name, publisher, tier) values
  ('census_2023', 'Census 2023',                 'Stats NZ',                      1),
  ('nzdep_2018',  'NZDep2018 Deprivation Index', 'University of Otago',           1),
  ('moe_schools', 'Schools Directory',           'Ministry of Education',         1),
  ('linz',        'LINZ Data Service',           'Toitū Te Whenua LINZ',          1),
  ('osm',         'OpenStreetMap',               'OpenStreetMap contributors',    1)
on conflict (source_key) do nothing;
-- TODO: set sources.licence for each row once confirmed (e.g. Stats NZ → CC BY 4.0, OSM → ODbL).
