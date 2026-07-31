-- ============================================================================
-- TRI-63 — MBIE quarterly rent artifact → metric_definitions + metric_values
-- (+ matview). Idempotent: source/definitions no-op on conflict, values upsert
-- on the natural key. Run AFTER scripts/etl/tri-63-mbie-rent.mjs output is
-- committed and pushed (http-extension pattern: the DB reads the raw
-- GitHub URL — swap the branch segment below for the branch that has the data;
-- after merge it should read from main). Re-running the pair (script → push →
-- this file) each quarter is the refresh mechanism.
--
-- Decisions (TRI-62 checkpoint, docs/spikes/tri-62-mbie-rent-bonds.md):
-- dimension 'housing'; all dwelling types / all bedroom counts only; weekly NZD;
-- rent levels higher_is_better = false, trend = NULL (no good direction for a
-- rent trend — ethics guard renders it neutral); per-row confidence from the
-- SA2-2019→2023 concordance (direct = medium — MBIE flags the series
-- provisional — parent-rule = low); suppression = row absence upstream.
-- display_order 4 makes the MBIE median the primary Housing rent row above the
-- census median (5); quartiles/trend sit after the census breakdowns (8-10).
-- ============================================================================

insert into sources (source_key, name, publisher, url, licence, tier) values
  ('mbie_tenancy_bonds', 'Tenancy bond data (quarterly, SA2)',
   'Ministry of Business, Innovation and Employment',
   'https://www.tenancy.govt.nz/about-tenancy-services/data-and-statistics/rental-bond-data/',
   'CC BY 3.0 NZ; attribution: The Ministry of Business, Innovation and Employment', 1)
on conflict (source_key) do nothing;

insert into metric_definitions (metric_key, label, dimension, unit, value_type, higher_is_better, description, display_order) values
  ('rent_median_weekly',         'Median rent (new tenancies)', 'housing', '$/week', 'scalar', false,
   'Median weekly rent of new tenancies (bonds lodged with MBIE), all dwelling types — quarterly, provisional series.', 4),
  ('rent_lower_quartile_weekly', 'Lower-quartile rent',         'housing', '$/week', 'scalar', false,
   'Lower-quartile weekly rent of new tenancies (bonds lodged with MBIE), all dwelling types — latest quarter.', 8),
  ('rent_upper_quartile_weekly', 'Upper-quartile rent',         'housing', '$/week', 'scalar', false,
   'Upper-quartile weekly rent of new tenancies (bonds lodged with MBIE), all dwelling types — latest quarter.', 9),
  ('rent_trend_12m_pct',         'Rent change (12 months)',     'housing', '%',      'scalar', null,
   'Change in median new-tenancy rent vs the same quarter one year earlier; requires both endpoints unsuppressed.', 10)
on conflict (metric_key) do nothing;

select http_set_curlopt('CURLOPT_TIMEOUT', '120');

with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/m13-live-rent/data/rent/tri63-rent-metrics.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (g text, m text, c text, v numeric, d date, cf text)
),
src as (select id from sources where source_key = 'mbie_tenancy_bonds')
insert into metric_values (geo_id, metric_id, category, value_num, source_id, as_of_date, confidence)
select geo.id, md.id, r.c, r.v, src.id, r.d, r.cf
from r
join geographies geo on geo.sa2_code = r.g and geo.geo_type = 'SA2'
join metric_definitions md on md.metric_key = r.m
cross join src
on conflict (geo_id, metric_id, category, as_of_date) do update
  set value_num = excluded.value_num, source_id = excluded.source_id, confidence = excluded.confidence;

refresh materialized view concurrently regional_metric_stats;
