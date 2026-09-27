-- ============================================================================
-- TRI-119 — built-form artifact → sources + metric_definitions + metric_values
-- (+ matview). Idempotent (tri-63/68/73/117/118/120 pattern). Run AFTER
-- scripts/etl/tri-119-built-form.mjs output is committed and pushed; http_get
-- reads the raw GitHub URL — branch segment must match where the data lives.
--
-- Decisions (TRI-119 spike, docs/spikes/tri-119-built-form.md):
--   * All three metrics are information about the physical stock —
--     higher_is_better NULL, never a verdict.
--   * Footprint/count are imagery-derived + SA2-assigned by building centre →
--     confidence 'medium'. Median property size uses LINZ's published area
--     per rating unit → 'high' (assignment to SA2 is the only approximation).
--   * Rating units of ALL types are included in the median (residential,
--     commercial, reserves): the description says so.
-- ============================================================================

insert into sources (source_key, name, publisher, url, licence, tier) values
  ('linz_building_outlines', 'NZ Building Outlines',
   'Toitū Te Whenua Land Information New Zealand',
   'https://data.linz.govt.nz/layer/101290-nz-building-outlines/', 'CC BY 4.0', 1),
  ('linz_property_boundaries', 'NZ Property Boundaries',
   'Toitū Te Whenua Land Information New Zealand',
   'https://data.linz.govt.nz/layer/122657-nz-property-boundaries/', 'CC BY 4.0', 1)
on conflict (source_key) do nothing;

insert into metric_definitions (metric_key, label, dimension, unit, value_type, higher_is_better, description, display_order) values
  ('building_footprint_pct', 'Building footprint coverage', 'planning', '%', 'scalar', null,
   'Share of the area''s land covered by building roof outlines (LINZ Building Outlines from aerial imagery, buildings ≥ 10 m²). A built-density indicator; roof outline, not floor area.', 35),
  ('buildings_per_ha', 'Buildings per hectare', 'planning', '/ha', 'scalar', null,
   'Number of building outlines per hectare of land (LINZ Building Outlines; includes garages and sheds ≥ 10 m²). Information about the stock, not a verdict.', 36),
  ('median_property_m2', 'Median property size', 'planning', 'm²', 'scalar', null,
   'Median land area of rating units in the area (LINZ Property Boundaries, all property types — residential, commercial and reserves alike); areas with fewer than 20 rating units are omitted.', 37)
on conflict (metric_key) do nothing;

select http_set_curlopt('CURLOPT_TIMEOUT', '120');

with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/built-form/tri119-built-form.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (g text, m text, c text, v numeric, d date, cf text)
),
src as (
  select m.metric_key, s.id as source_id
  from (values ('building_footprint_pct','linz_building_outlines'),
               ('buildings_per_ha','linz_building_outlines'),
               ('median_property_m2','linz_property_boundaries')) as m(metric_key, source_key)
  join sources s on s.source_key = m.source_key
)
insert into metric_values (geo_id, metric_id, category, value_num, source_id, as_of_date, confidence)
select geo.id, md.id, r.c, r.v, src.source_id, r.d, r.cf
from r
join geographies geo on geo.sa2_code = r.g and geo.geo_type = 'SA2'
join metric_definitions md on md.metric_key = r.m
join src on src.metric_key = r.m
on conflict (geo_id, metric_id, category, as_of_date) do update
  set value_num = excluded.value_num, source_id = excluded.source_id, confidence = excluded.confidence;

refresh materialized view concurrently regional_metric_stats;
