-- ============================================================================
-- NZ Suburb Intelligence — Nearby schools + CBD distance (migration 0005, TRI-36)
-- Plain invoker-rights functions: schools and geographies already carry
-- public-read RLS policies, so anon callers see exactly what RLS allows.
-- Distances are geodesic (PostGIS geography) from the suburb centroid.
-- ============================================================================

-- Schools nearest to a suburb's centroid — fixes the "zoned school isn't
-- inside your SA2" gap (e.g. Auckland Grammar vs neighbouring suburbs).
create or replace function nearby_schools(p_sa2_code text, p_count int default 8)
returns table (
  name text,
  school_type text,
  authority text,
  roll int,
  distance_km numeric
)
language sql
stable
set search_path = public
as $$
  select s.name,
         s.school_type,
         s.authority,
         s.roll,
         round((st_distance(g.centroid, s.location) / 1000.0)::numeric, 1) as distance_km
  from geographies g
  join schools s on s.location is not null
  where g.geo_type = 'SA2' and g.sa2_code = p_sa2_code and g.centroid is not null
  order by g.centroid <-> s.location
  limit least(greatest(p_count, 1), 20);
$$;

-- Straight-line distance from the suburb centroid to the Auckland CBD
-- (Sky Tower, 174.7633 -36.8485). v1 commute proxy — honest "as the crow
-- flies"; routed/peak times are Tier-2 (paid routing APIs).
create or replace function cbd_distance_km(p_sa2_code text)
returns numeric
language sql
stable
set search_path = public
as $$
  select round((st_distance(
           g.centroid,
           st_setsrid(st_makepoint(174.7633, -36.8485), 4326)::geography
         ) / 1000.0)::numeric, 1)
  from geographies g
  where g.geo_type = 'SA2' and g.sa2_code = p_sa2_code and g.centroid is not null;
$$;

grant execute on function nearby_schools(text, int) to anon, authenticated;
grant execute on function cbd_distance_km(text) to anon, authenticated;
