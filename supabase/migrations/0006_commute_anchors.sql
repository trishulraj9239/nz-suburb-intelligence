-- ============================================================================
-- NZ Suburb Intelligence — Commute layer: anchors + origins + staging
-- (migration 0006, TRI-41/TRI-42/TRI-43)
--
-- Decision records:
--  * Anchors are DATA, not code (TRI-42): adding a third anchor later is an
--    insert, zero code changes. Coordinates must be ROUTABLE — within 350 m of
--    a road on the ORS graph or the API 404s (error 2010). Both seeds verified
--    against ORS directions 2026-07-31 (airport = terminal drop-off, not the
--    runway; snapped_distance 57 m).
--  * commute_origins (TRI-43): geographies stores only centroid points — the
--    ArcGIS attribute centroid, which can fall in water for harbour SA2s.
--    Commute origins instead use ST_PointOnSurface over the same polygons the
--    map bundles (public/geo/auckland-sa2.geojson), computed server-side via
--    the http extension + GitHub raw (the TRI-17 load pattern). Kept as a
--    separate table: `centroid` keeps meaning "geometric centroid" for
--    distance queries; origins are routing-specific.
--  * commute_staging (TRI-46): raw ORS matrix output lands here before
--    becoming metric_values rows — explicit failure rows instead of silent
--    gaps, and re-runs upsert on (sa2_code, anchor_key, mode).
--  * RLS: anchors are public-read (UI shows anchor labels). Origins and
--    staging are ETL internals — RLS on, no policies (service role only).
--  * Sources (TRI-41): ors_osm = routing engine + road data (ODbL — the UI
--    chip must attribute OpenStreetMap); linz_addresses = geocoding source
--    (CC BY 4.0), table itself lands in 0007. Backfills the 0001 TODO licences.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Anchors — fixed commute destinations (CBD, airport, ... later: config only)
-- --------------------------------------------------------------------------
create table anchors (
  id            bigint generated always as identity primary key,
  anchor_key    text not null unique,            -- 'cbd', 'airport'
  label         text not null,                   -- UI display name
  lng           double precision not null,
  lat           double precision not null,
  location      geography(Point, 4326)
                  generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  display_order int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table anchors enable row level security;
create policy "public read" on anchors for select to anon, authenticated using (true);
grant select on anchors to anon, authenticated;

insert into anchors (anchor_key, label, lng, lat, display_order) values
  ('cbd',     'Auckland CBD (Britomart)', 174.76910, -36.84420, 1),
  ('airport', 'Auckland Airport',         174.78675, -37.00436, 2);

-- --------------------------------------------------------------------------
-- Commute origins — routable representative point per SA2 (ST_PointOnSurface)
-- --------------------------------------------------------------------------
create table commute_origins (
  sa2_code    text primary key,
  origin      geography(Point, 4326) not null,
  method      text not null default 'point_on_surface',
  computed_at timestamptz not null default now()
);

-- Public-read: origins derive from public boundary polygons — same posture as
-- geographies. The ETL fetches them over PostgREST (no service key on dev
-- machines), via the flat view below (PostgREST can't unpack geography).
alter table commute_origins enable row level security;
create policy "public read" on commute_origins for select to anon, authenticated using (true);
grant select on commute_origins to anon, authenticated;

create view commute_origin_points
with (security_invoker = true) as
select o.sa2_code,
       st_x(o.origin::geometry) as lng,
       st_y(o.origin::geometry) as lat,
       g.is_active
from commute_origins o
join geographies g on g.sa2_code = o.sa2_code and g.geo_type = 'SA2';

grant select on commute_origin_points to anon, authenticated;

-- --------------------------------------------------------------------------
-- Commute staging — raw ORS matrix output, one row per SA2 × anchor × mode
-- --------------------------------------------------------------------------
create table commute_staging (
  sa2_code     text not null,
  anchor_key   text not null references anchors (anchor_key),
  mode         text not null,                    -- 'driving-car' | 'cycling-regular' | 'foot-walking'
  duration_s   numeric,                          -- null when status = 'failed'
  distance_m   numeric,
  status       text not null default 'ok',       -- 'ok' | 'failed'
  detail       text,                             -- failure reason when status = 'failed'
  retrieved_at timestamptz not null default now(),
  primary key (sa2_code, anchor_key, mode)
);

alter table commute_staging enable row level security;  -- no policies: ETL/server only

-- --------------------------------------------------------------------------
-- Source registry (TRI-41) — register before any metric lands
-- --------------------------------------------------------------------------
insert into sources (source_key, name, publisher, url, licence, tier) values
  ('ors_osm', 'openrouteservice routing (OpenStreetMap)',
   'HeiGIT gGmbH / OpenStreetMap contributors',
   'https://openrouteservice.org', 'ODbL 1.0 (OSM road data); attribution required', 1),
  ('linz_addresses', 'NZ Addresses',
   'Toitū Te Whenua Land Information New Zealand',
   'https://data.linz.govt.nz/layer/123113-nz-addresses/', 'CC BY 4.0', 1)
on conflict (source_key) do nothing;

-- Backfill the 0001 TODO licences on existing rows.
update sources set licence = 'ODbL 1.0'  where source_key = 'osm'         and licence is null;
update sources set licence = 'CC BY 4.0' where source_key = 'census_2023' and licence is null;
update sources set licence = 'CC BY 4.0' where source_key = 'moe_schools' and licence is null;
update sources set licence = 'CC BY 4.0' where source_key = 'linz'        and licence is null;
update sources set licence = 'CC BY 4.0' where source_key = 'nzdep_2018'  and licence is null;
