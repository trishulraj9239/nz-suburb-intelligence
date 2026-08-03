-- ============================================================================
-- TRI-73 — building-consents artifact → sources + metric_definitions +
-- metric_values (+ matview). Idempotent (tri-48/tri-63/tri-68 pattern). Run
-- AFTER scripts/etl/tri-73-consents.mjs output is committed and pushed;
-- http_get reads the raw GitHub URL — branch segment must match where the
-- data lives (main after merge).
--
-- Decisions (TRI-72 spike sign-off 2026-08-04, docs/spikes/tri-72-stats-consents.md):
-- SA2-2023 direct join (no fallback); total_dwelling_units only (splits →
-- TRI-77); 24 monthly rolling-12m as_of_dates (sparkline via the M13 history
-- mechanism); rate metric mixes vintages (2023 census denominator) so its
-- confidence caps at 'medium' while the counts are 'high' (exact admin data).
-- higher_is_better NULL on both — consenting activity is information about a
-- suburb's development trajectory, never a verdict.
-- ============================================================================

insert into sources (source_key, name, publisher, url, licence, tier) values
  ('stats_building_consents', 'Building consents issued (new dwellings by SA2)',
   'Stats NZ Tatauranga Aotearoa',
   'https://www.stats.govt.nz/information-releases/?filters=Building%20consents%20issued',
   'CC BY 4.0; attribution: Stats NZ', 1)
on conflict (source_key) do nothing;

insert into metric_definitions (metric_key, label, dimension, unit, value_type, higher_is_better, description, display_order) values
  ('consents_new_dwellings_12m', 'New dwellings consented (12 m)', 'planning', null, 'scalar', null,
   'New dwelling units consented in the trailing 12 months (Stats NZ building consents, monthly, ~2-month publication lag). Consents are intentions to build, not completions.', 33),
  ('consents_per_1000_dwellings', 'Consenting rate', 'planning', '/1k dwellings', 'scalar', null,
   'New dwellings consented in the trailing 12 months per 1,000 existing dwellings (Census 2023 count) — a development-activity rate, not a forecast.', 34)
on conflict (metric_key) do nothing;

select http_set_curlopt('CURLOPT_TIMEOUT', '120');

with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/consents/tri73-consents.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (g text, m text, c text, v numeric, d date, cf text)
),
src as (select id from sources where source_key = 'stats_building_consents')
insert into metric_values (geo_id, metric_id, category, value_num, source_id, as_of_date, confidence)
select geo.id, md.id, r.c, r.v, src.id, r.d, r.cf
from r
join geographies geo on geo.sa2_code = r.g and geo.geo_type = 'SA2'
join metric_definitions md on md.metric_key = r.m
cross join src
on conflict (geo_id, metric_id, category, as_of_date) do update
  set value_num = excluded.value_num, source_id = excluded.source_id, confidence = excluded.confidence;

refresh materialized view concurrently regional_metric_stats;
