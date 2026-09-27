-- ============================================================================
-- TRI-117 — NZDep2023 artifact → sources + metric_values (second deprivation
-- vintage) + vintage-neutral metric labels. Idempotent (tri-63/tri-68/tri-73
-- pattern). Run AFTER scripts/etl/tri-117-nzdep2023.mjs output is committed
-- and pushed; http_get reads the raw GitHub URL — the branch segment must
-- match where the data lives (main after merge, the feature branch before).
--
-- Decisions (TRI-117 spike, docs/spikes/tri-117-nzdep2023.md):
--   * NZDep2018 rows are KEPT (as_of 2018-03-06) — the profile renders the
--     2018→2023 delta and every rank uses the latest vintage (TRI-64). Nothing
--     is deleted.
--   * NZDep2023 joins SA2-2023 directly → confidence 'high' on every row; the
--     TRI-18 parent-inheritance ('low') rule no longer applies to 2023 rows.
--   * higher_is_better stays NULL: deprivation is information, never a verdict.
--   * Labels drop the "(NZDep2018)" suffix so the registry is vintage-neutral;
--     the source chip carries the vintage ("NZDep2023 · 2023").
-- ============================================================================

insert into sources (source_key, name, publisher, url, licence, tier) values
  ('nzdep_2023', 'NZDep2023 Deprivation Index',
   'University of Otago (Health Inequalities Research Programme)',
   'https://www.otago.ac.nz/wellington/research/groups/research-groups-in-the-department-of-public-health/hirp/socioeconomic-deprivation-indexes',
   'CC BY 4.0; attribution: Atkinson J, Salmond C, Crampton P, Viggers H, Lacey K (2024). NZDep2023 Index of Socioeconomic Deprivation. University of Otago', 1)
on conflict (source_key) do nothing;

update metric_definitions set
  label = 'Deprivation decile',
  description = 'NZDep weighted-average decile for the area (University of Otago; NZDep2023 is current, NZDep2018 kept for change). 1 = least deprived 10% of NZ areas, 10 = most deprived. There is no "better" — never render as a verdict.'
where metric_key = 'nzdep_decile';

update metric_definitions set
  label = 'Deprivation score',
  description = 'NZDep weighted-average index score for the area (higher = more deprived; NZDep2023 is current, NZDep2018 kept for change). Companion to the decile for finer comparison — information, not a verdict.'
where metric_key = 'nzdep_score';

select http_set_curlopt('CURLOPT_TIMEOUT', '120');

with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/census/tri117-nzdep2023.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (g text, m text, c text, v numeric, d date, cf text)
),
src as (select id from sources where source_key = 'nzdep_2023')
insert into metric_values (geo_id, metric_id, category, value_num, source_id, as_of_date, confidence)
select geo.id, md.id, r.c, r.v, src.id, r.d, r.cf
from r
join geographies geo on geo.sa2_code = r.g and geo.geo_type = 'SA2'
join metric_definitions md on md.metric_key = r.m
cross join src
on conflict (geo_id, metric_id, category, as_of_date) do update
  set value_num = excluded.value_num, source_id = excluded.source_id, confidence = excluded.confidence;

refresh materialized view concurrently regional_metric_stats;

-- Verify (expected: 2023 rows = 2 × matched suburbs, all 'high'; 2018 rows untouched)
-- select md.metric_key, s.source_key, mv.as_of_date, mv.confidence, count(*)
-- from metric_values mv join metric_definitions md on md.id = mv.metric_id
-- join sources s on s.id = mv.source_id where md.metric_key like 'nzdep%'
-- group by 1,2,3,4 order by 1,3;
