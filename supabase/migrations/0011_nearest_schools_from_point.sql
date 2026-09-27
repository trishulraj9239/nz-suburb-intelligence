-- 0011 — nearest schools from a POINT (TRI-131).
--
-- Decision record
-- ---------------
-- The profile's "nearby schools" (0005) measure from the SA2 centroid, which
-- is meaningless for a pinned address. This function measures from the pin
-- itself using the existing GiST index on schools.location (KNN <->), and
-- returns the closest N with their type so the caller can pick the nearest
-- primary / intermediate / secondary. It is a plain STABLE SQL function —
-- the schools table is public-read under RLS (0001), so no SECURITY DEFINER
-- is needed and the anon key can call it. Distances are geodesic metres,
-- i.e. straight-line: the surface labels them "as the crow flies", and a
-- nearest school is proximity only — zoning is TRI-101.
--
-- Additive: no tables or columns change.

create or replace function nearest_schools_from_point(
  p_lng double precision,
  p_lat double precision,
  p_count int default 12
)
returns table (
  name text,
  school_type text,
  authority text,
  year_levels text,
  roll int,
  distance_m int,
  lng double precision,
  lat double precision
)
language sql
stable
set search_path = public
as $$
  with p as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  )
  select s.name,
         s.school_type,
         s.authority,
         s.year_levels,
         s.roll,
         round(st_distance(p.g, s.location))::int as distance_m,
         st_x(s.location::geometry) as lng,
         st_y(s.location::geometry) as lat
  from schools s, p
  where s.location is not null
  order by s.location <-> p.g
  limit least(greatest(p_count, 1), 40);
$$;

grant execute on function nearest_schools_from_point(double precision, double precision, int) to anon, authenticated;
