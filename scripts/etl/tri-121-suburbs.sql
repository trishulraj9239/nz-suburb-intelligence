-- ============================================================================
-- TRI-121 — LINZ suburbs artifacts → suburbs + suburb_sa2. Idempotent. Run
-- AFTER migration 0010 and after scripts/etl/tri-121-suburbs.mjs output is
-- committed and pushed; http_get reads the raw GitHub URL — the branch
-- segment must match where the data lives (main after merge).
-- ============================================================================

select http_set_curlopt('CURLOPT_TIMEOUT', '120');

with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/suburbs/tri121-suburbs.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (i bigint, n text, na text, al text[], t text, mj text, pop integer, x double precision, y double precision)
)
insert into suburbs (linz_id, name, name_ascii, aliases, type, major_name, population_estimate, lng, lat)
select r.i, r.n, r.na, coalesce(r.al, '{}'), r.t, r.mj, r.pop, r.x, r.y
from r
on conflict (linz_id) do update
  set name = excluded.name, name_ascii = excluded.name_ascii, aliases = excluded.aliases,
      type = excluded.type, major_name = excluded.major_name,
      population_estimate = excluded.population_estimate, lng = excluded.lng, lat = excluded.lat;

-- Links are replaced wholesale for the suburbs in the artifact (the overlap
-- table is a pure function of the two polygon sets).
with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/suburbs/tri121-suburb-sa2.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (i bigint, g text, ss numeric, sb numeric)
),
del as (
  delete from suburb_sa2 m where m.linz_id in (select distinct i from r)
)
insert into suburb_sa2 (linz_id, sa2_code, sa2_share, suburb_share)
select r.i, r.g, r.ss, r.sb
from r
join geographies g on g.sa2_code = r.g and g.geo_type = 'SA2'
on conflict (linz_id, sa2_code) do update
  set sa2_share = excluded.sa2_share, suburb_share = excluded.suburb_share;

-- Verify
-- select count(*) from suburbs; select count(*) from suburb_sa2;
-- select * from resolve_suburb('Grey Lynn', 3);
-- select * from resolve_suburb('Arch Hill', 3);   -- alias → Grey Lynn
