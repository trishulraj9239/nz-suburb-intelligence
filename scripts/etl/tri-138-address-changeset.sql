-- ============================================================================
-- TRI-138 — apply a LINZ NZ Addresses changeset artifact to `addresses`.
-- Idempotent (re-applying the same artifact is a no-op). Run AFTER
-- scripts/etl/tri-138-address-changeset.mjs output is committed and pushed;
-- http_get reads the raw GitHub URL — the branch segment must match where the
-- data lives (main after merge, the feature branch before).
--
-- Order matters: deletes first (includes rows that moved outside the Auckland
-- SA2 set), then upserts on linz_id (the LINZ address_id, TRI-44's key).
-- Nothing touches rows the changeset doesn't name.
-- ============================================================================

select http_set_curlopt('CURLOPT_TIMEOUT', '180');

create temporary table cs on commit drop as
select content::jsonb as j
from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/addresses/tri138-changeset.json');

delete from addresses a
using (select (jsonb_array_elements_text(j -> 'deletes'))::bigint as linz_id from cs) d
where a.linz_id = d.linz_id;

insert into addresses (linz_id, full_address, suburb_locality, town_city, lng, lat, sa2_code)
select x.i, x.a, x.s, x.t, x.x, x.y, x.g
from cs, jsonb_to_recordset(cs.j -> 'upserts')
  as x (i bigint, a text, s text, t text, x double precision, y double precision, g text)
on conflict (linz_id) do update
  set full_address = excluded.full_address,
      suburb_locality = excluded.suburb_locality,
      town_city = excluded.town_city,
      lng = excluded.lng,
      lat = excluded.lat,
      sa2_code = excluded.sa2_code;

analyze addresses;

-- Verify
-- select count(*) as addresses, count(*) filter (where sa2_code is null) as no_sa2 from addresses;
-- select * from geocode_address('<a sample upsert full_address>', 3);
