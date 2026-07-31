-- ============================================================================
-- TRI-48 — commute staging → metric_definitions + metric_values (+ matview).
-- Idempotent: definitions no-op on conflict, values upsert on the natural key.
-- Run AFTER scripts/etl/tri-46-commute-matrix.mjs output is loaded into
-- commute_staging (http-extension pattern — see TRI-17 notes / docs/sources.md).
-- Re-running the pair (TRI-46 script → load → this file) is the refresh
-- mechanism; bump :run_date to the new matrix run date when refreshing.
--
-- Decisions: dimension 'commute' ("Getting around" UI section); minutes at
-- 1 dp; higher_is_better = false (first metrics to use it — percentile bars
-- read "shorter is better"); confidence 'medium' (typical routed time, no
-- live traffic); source = ors_osm (ODbL attribution flows to the UI chip).
-- Only 4 of the 6 staged anchor×mode pairs become metrics (cycle/walk to the
-- airport stay staging-only until a real question needs them).
-- ============================================================================

insert into metric_definitions (metric_key, label, dimension, unit, value_type, higher_is_better, description, display_order) values
  ('commute_cbd_drive_min',     'Drive to CBD',     'commute', 'min', 'scalar', false, 'Typical drive time to Auckland CBD (Britomart) via openrouteservice/OSM — no live traffic.', 10),
  ('commute_cbd_cycle_min',     'Cycle to CBD',     'commute', 'min', 'scalar', false, 'Typical cycling time to Auckland CBD (Britomart) via openrouteservice/OSM.', 11),
  ('commute_cbd_walk_min',      'Walk to CBD',      'commute', 'min', 'scalar', false, 'Typical walking time to Auckland CBD (Britomart) via openrouteservice/OSM; may use ferry links.', 12),
  ('commute_airport_drive_min', 'Drive to Airport', 'commute', 'min', 'scalar', false, 'Typical drive time to Auckland Airport via openrouteservice/OSM — no live traffic.', 13)
on conflict (metric_key) do nothing;

with m as (
  select metric_key, id from metric_definitions where dimension = 'commute'
),
map as (
  select * from (values
    ('cbd',     'driving-car',     'commute_cbd_drive_min'),
    ('cbd',     'cycling-regular', 'commute_cbd_cycle_min'),
    ('cbd',     'foot-walking',    'commute_cbd_walk_min'),
    ('airport', 'driving-car',     'commute_airport_drive_min')
  ) as t (anchor_key, mode, metric_key)
),
src as (select id from sources where source_key = 'ors_osm')
insert into metric_values (geo_id, metric_id, category, value_num, source_id, as_of_date, confidence)
select g.id, m.id, null, round(cs.duration_s / 60.0, 1), src.id, date '2026-07-31', 'medium'
from commute_staging cs
join map on map.anchor_key = cs.anchor_key and map.mode = cs.mode
join m on m.metric_key = map.metric_key
join geographies g on g.sa2_code = cs.sa2_code and g.geo_type = 'SA2'
cross join src
where cs.status = 'ok'
on conflict (geo_id, metric_id, category, as_of_date) do update
  set value_num = excluded.value_num, source_id = excluded.source_id, confidence = excluded.confidence;

refresh materialized view concurrently regional_metric_stats;
