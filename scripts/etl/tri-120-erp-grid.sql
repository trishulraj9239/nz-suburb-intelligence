-- ============================================================================
-- TRI-120 — ERP-grid artifact → sources + metric_definitions + metric_values
-- (+ matview). Idempotent (tri-63/68/73/117/118 pattern). Run AFTER
-- scripts/etl/tri-120-erp-grid.mjs output is committed and pushed; http_get
-- reads the raw GitHub URL — the branch segment must match where the data
-- lives (main after merge, the feature branch before).
--
-- Decisions (TRI-120 spike, docs/spikes/tri-120-erp-grid.md):
--   * Separate metric `population_estimate` — the census `population` series
--     stays pure counts; estimates never mix into it.
--   * confidence 'medium' everywhere: modelled estimates, grid-apportioned by
--     cell centroid, and provisional for 2024/2025 (Stats NZ: "not official
--     statistics").
--   * higher_is_better NULL on both — growth is information, not a verdict.
-- ============================================================================

insert into sources (source_key, name, publisher, url, licence, tier) values
  ('stats_erp_grid_250m', 'Estimated resident population grid (250 m)',
   'Stats NZ Tatauranga Aotearoa',
   'https://datafinder.stats.govt.nz/layer/119709-new-zealand-estimated-resident-population-grid-250-metre/',
   'CC BY 4.0; attribution: Stats NZ', 1)
on conflict (source_key) do nothing;

insert into metric_definitions (metric_key, label, dimension, unit, value_type, higher_is_better, description, display_order) values
  ('population_estimate', 'Population estimate (30 June)', 'people', 'people', 'scalar', null,
   'Estimated resident population at 30 June (2022–2025), summed from Stats NZ''s 250 m population grid by cell centre. An estimate, not a census count; 2024 and 2025 are provisional and the grid is not an official statistic.', 5),
  ('population_growth_2y_pct', 'Population change (2 years)', 'people', '%', 'scalar', null,
   'Change in the estimated resident population between 30 June 2023 and 30 June 2025 (Stats NZ 250 m grid, provisional). Growth pressure indicator, not a forecast; areas under 100 residents in 2023 are omitted.', 6)
on conflict (metric_key) do nothing;

select http_set_curlopt('CURLOPT_TIMEOUT', '120');

with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/census/tri120-erp-grid.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (g text, m text, c text, v numeric, d date, cf text)
),
src as (select id from sources where source_key = 'stats_erp_grid_250m')
insert into metric_values (geo_id, metric_id, category, value_num, source_id, as_of_date, confidence)
select geo.id, md.id, r.c, r.v, src.id, r.d, r.cf
from r
join geographies geo on geo.sa2_code = r.g and geo.geo_type = 'SA2'
join metric_definitions md on md.metric_key = r.m
cross join src
on conflict (geo_id, metric_id, category, as_of_date) do update
  set value_num = excluded.value_num, source_id = excluded.source_id, confidence = excluded.confidence;

refresh materialized view concurrently regional_metric_stats;
