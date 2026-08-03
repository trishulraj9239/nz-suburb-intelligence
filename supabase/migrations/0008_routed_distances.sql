-- ============================================================================
-- NZ Suburb Intelligence — Routed distances (migration 0008, TRI-76)
--
-- Replaces straight-line distance calculations with openrouteservice road
-- distances, suburb origin → target. Decisions:
--  * CBD: the TRI-46 matrix run already stored routed driving distance_m in
--    commute_staging (never surfaced — only durations became metrics). A new
--    cbd_distance_routed() exposes it. SECURITY DEFINER because staging is
--    server-only (RLS, no policies); the function pins search_path and
--    validates its input shape, and returns only the one derived number —
--    same gate posture as geocode_address() in 0007. The old straight-line
--    cbd_distance_km() is kept unchanged so the deployed UI keeps working
--    until the TRI-76 UI ships; drop it in a later cleanup migration.
--  * Schools: school_road_distances holds precomputed ORS driving results for
--    each suburb's ~12 nearest candidate schools (top-N by geodesic; road
--    rank can't overtake from outside that candidate set — acceptable, roads
--    rarely reorder beyond ~12 nearest). Public-read: derived from public
--    MOE + OSM data. GRANT alongside RLS policy (0001 gotcha: PostgREST
--    needs both).
--  * nearby_schools() re-ranks by road km where present, geodesic otherwise,
--    and reports method ('road' | 'straight line') per row so the UI labels
--    honestly. Return columns are additive; drop+recreate is required to
--    change the OUT signature (CREATE OR REPLACE cannot).
--  * school_points view: ETL input over PostgREST — PostgREST can't unpack
--    geography, same reason commute_origin_points exists (0006).
--  * Straight-line stays the labelled fallback wherever routing failed
--    (island suburbs — ~14 unroutables in the TRI-46 run).
-- ============================================================================

-- --------------------------------------------------------------------------
-- ETL input: school coordinates, flat (mirrors commute_origin_points)
-- --------------------------------------------------------------------------
create view school_points
with (security_invoker = true) as
select s.id as school_id,
       s.moe_number,
       s.name,
       st_x(s.location::geometry) as lng,
       st_y(s.location::geometry) as lat
from schools s
where s.location is not null;

grant select on school_points to anon, authenticated;

-- --------------------------------------------------------------------------
-- Precomputed suburb → school road distances (ORS driving-car)
-- --------------------------------------------------------------------------
create table school_road_distances (
  sa2_code     text not null,
  school_id    bigint not null references schools (id),
  distance_m   numeric,                        -- null when status = 'failed'
  duration_s   numeric,
  status       text not null default 'ok',     -- 'ok' | 'failed'
  retrieved_at timestamptz not null default now(),
  primary key (sa2_code, school_id)
);

alter table school_road_distances enable row level security;
create policy "public read" on school_road_distances for select to anon, authenticated using (true);
grant select on school_road_distances to anon, authenticated;

-- --------------------------------------------------------------------------
-- nearby_schools v2 — road distance where precomputed, geodesic fallback
-- --------------------------------------------------------------------------
drop function if exists nearby_schools(text, int);

create function nearby_schools(p_sa2_code text, p_count int default 8)
returns table (
  name text,
  school_type text,
  authority text,
  roll int,
  distance_km numeric,
  drive_min numeric,
  method text
)
language sql
stable
set search_path = public
as $$
  select s.name,
         s.school_type,
         s.authority,
         s.roll,
         case when d.distance_m is not null
              then round((d.distance_m / 1000.0)::numeric, 1)
              else round((st_distance(g.centroid, s.location) / 1000.0)::numeric, 1)
         end as distance_km,
         case when d.duration_s is not null
              then round((d.duration_s / 60.0)::numeric, 0)
         end as drive_min,
         case when d.distance_m is not null then 'road' else 'straight line' end as method
  from geographies g
  join schools s on s.location is not null
  left join school_road_distances d
    on d.sa2_code = g.sa2_code and d.school_id = s.id and d.status = 'ok'
  where g.geo_type = 'SA2' and g.sa2_code = p_sa2_code and g.centroid is not null
  order by coalesce(d.distance_m / 1000.0, st_distance(g.centroid, s.location) / 1000.0)
  limit least(greatest(p_count, 1), 20);
$$;

grant execute on function nearby_schools(text, int) to anon, authenticated;

-- --------------------------------------------------------------------------
-- cbd_distance_routed — routed driving km from the TRI-46 staging rows
-- --------------------------------------------------------------------------
create function cbd_distance_routed(p_sa2_code text)
returns table (distance_km numeric, drive_min numeric, method text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(round((cs.distance_m / 1000.0)::numeric, 1),
                  round((st_distance(g.centroid,
                    st_setsrid(st_makepoint(174.7633, -36.8485), 4326)::geography
                  ) / 1000.0)::numeric, 1)) as distance_km,
         round((cs.duration_s / 60.0)::numeric, 0) as drive_min,
         case when cs.distance_m is not null then 'road' else 'straight line' end as method
  from geographies g
  left join commute_staging cs
    on cs.sa2_code = g.sa2_code and cs.anchor_key = 'cbd'
   and cs.mode = 'driving-car' and cs.status = 'ok'
  where g.geo_type = 'SA2'
    and g.sa2_code = p_sa2_code
    and g.sa2_code ~ '^[0-9]{6}$'      -- input shape gate (SECURITY DEFINER)
    and g.centroid is not null;
$$;

grant execute on function cbd_distance_routed(text) to anon, authenticated;
