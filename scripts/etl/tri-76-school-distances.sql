-- ============================================================================
-- TRI-76 — school road distances artifact → school_road_distances.
-- Idempotent upsert on (sa2_code, school_id); re-running the pair
-- (tri-76-school-distances.mjs → this file) is the refresh mechanism.
-- Run AFTER the artifact is committed and pushed; http_get reads the raw
-- GitHub URL — branch segment must match where the data lives (main after
-- merge). Failed rows load too (status 'failed'): explicit failures, never
-- silent gaps — nearby_schools() ignores them and falls back to geodesic.
-- ============================================================================

select http_set_curlopt('CURLOPT_TIMEOUT', '120');

with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/commute/tri76-school-distances.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (g text, sid bigint, m numeric, s numeric, status text)
)
insert into school_road_distances (sa2_code, school_id, distance_m, duration_s, status)
select r.g, r.sid, r.m, r.s, r.status
from r
join schools sc on sc.id = r.sid          -- FK safety: skip ids that vanished
on conflict (sa2_code, school_id) do update
  set distance_m = excluded.distance_m, duration_s = excluded.duration_s,
      status = excluded.status, retrieved_at = now();
