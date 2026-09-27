-- ============================================================================
-- TRI-118 — Census 2023 housing-quality artifact → sources + metric_definitions
-- + metric_values (+ matview). Idempotent (tri-63/68/73/117 pattern). Run
-- AFTER scripts/etl/tri-118-housing-quality.mjs output is committed and
-- pushed; http_get reads the raw GitHub URL — the branch segment must match
-- where the data lives (main after merge, the feature branch before).
--
-- Decisions (TRI-118 spike, docs/spikes/tri-118-census-housing-quality.md):
--   * damp / mould: lower is better (the only two verdict-carrying metrics
--     here — they describe measured living conditions, not people).
--   * heat pump / no heating / bedrooms / density: higher_is_better NULL —
--     information about the stock, not a verdict.
--   * Suppressed cells (-999) absent, never zero; % metrics need ≥ 30 stated
--     dwellings; heating shares are single-category (multi-response source).
-- ============================================================================

insert into sources (source_key, name, publisher, url, licence, tier) values
  ('stats_census_2023_dwellings', 'Census 2023 dwellings (totals by topic, SA2)',
   'Stats NZ Tatauranga Aotearoa',
   'https://datafinder.stats.govt.nz/layer/120853-2023-census-totals-by-topic-for-dwellings-by-statistical-area-2/',
   'CC BY 4.0; attribution: Stats NZ', 1)
on conflict (source_key) do nothing;

insert into metric_definitions (metric_key, label, dimension, unit, value_type, higher_is_better, description, display_order) values
  ('dwelling_damp_pct', 'Damp dwellings', 'housing', '%', 'scalar', false,
   'Occupied private dwellings reporting damp always or sometimes, as a share of dwellings that answered (Census 2018 and 2023). Counts are random-rounded; suppressed cells are absent; suburbs with fewer than 30 answering dwellings are omitted.', 11),
  ('dwelling_mould_pct', 'Mouldy dwellings', 'housing', '%', 'scalar', false,
   'Occupied private dwellings reporting visible mould larger than A4 always or sometimes, as a share of dwellings that answered (Census 2018 and 2023). Same rounding, suppression and 30-dwelling rules as damp.', 12),
  ('avg_bedrooms', 'Average bedrooms', 'housing', 'bedrooms', 'scalar', null,
   'Mean number of bedrooms per occupied private dwelling (Census 2013, 2018, 2023). Describes the housing stock, not a verdict.', 13),
  ('bedrooms', 'Bedrooms per dwelling', 'housing', null, 'breakdown', null,
   'Occupied private dwellings by number of bedrooms (Census 2013, 2018, 2023); shares are of dwellings that answered.', 14),
  ('heat_pump_pct', 'Homes with a heat pump', 'housing', '%', 'scalar', null,
   'Share of occupied private dwellings using a heat pump as a main heating type (Census 2018, 2023). Heating is a multi-response question, so this is one type''s share, not a composition.', 15),
  ('no_heating_pct', 'Homes with no heating', 'housing', '%', 'scalar', null,
   'Share of occupied private dwellings reporting no heating used (Census 2018, 2023). Information about the stock, not a verdict.', 16),
  ('dwelling_density_per_km2', 'Dwellings per km²', 'housing', '/km²', 'scalar', null,
   'Total private dwellings (occupied + unoccupied) per km² of land area (Census 2013, 2018, 2023; land area per Stats NZ). A built-density indicator, not a verdict.', 17)
on conflict (metric_key) do nothing;

select http_set_curlopt('CURLOPT_TIMEOUT', '120');

with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/census/tri118-housing-quality.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (g text, m text, c text, v numeric, d date, cf text)
),
src as (select id from sources where source_key = 'stats_census_2023_dwellings')
insert into metric_values (geo_id, metric_id, category, value_num, source_id, as_of_date, confidence)
select geo.id, md.id, r.c, r.v, src.id, r.d, r.cf
from r
join geographies geo on geo.sa2_code = r.g and geo.geo_type = 'SA2'
join metric_definitions md on md.metric_key = r.m
cross join src
on conflict (geo_id, metric_id, category, as_of_date) do update
  set value_num = excluded.value_num, source_id = excluded.source_id, confidence = excluded.confidence;

refresh materialized view concurrently regional_metric_stats;

-- Verify
-- select md.metric_key, mv.as_of_date, count(*) from metric_values mv
-- join metric_definitions md on md.id = mv.metric_id
-- where md.metric_key in ('dwelling_damp_pct','dwelling_mould_pct','avg_bedrooms','bedrooms','heat_pump_pct','no_heating_pct','dwelling_density_per_km2')
-- group by 1,2 order by 1,2;
