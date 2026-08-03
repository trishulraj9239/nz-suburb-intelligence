-- ============================================================================
-- TRI-68 — hazard + zoning artifact → sources + metric_definitions +
-- metric_values (+ matview). Idempotent (tri-48/tri-63 pattern). Run AFTER
-- scripts/etl/tri-68-hazard-metrics.mjs (per layer, then `assemble`) output is
-- committed and pushed; http_get reads the raw GitHub URL — branch segment
-- below must match where the data lives (main after merge).
--
-- Decisions (TRI-67 audit + sign-off, docs/spikes/tri-67-hazard-licence-audit.md):
-- all layers CC BY 4.0 w/ attribution; HAIL dropped (no open Auckland data);
-- overland flow = density km/km²; liquefaction = Calibrated 5-class breakdown;
-- coastal = base 1% AEP + the +1 m SLR variant; every hazard metric
-- higher_is_better = NULL (exposure is information, never a verdict);
-- confidence 'medium' (derived from intersection of council layers — NZDep
-- precedent); as_of = each service's lastEditDate at retrieval. Percentages
-- are of the SA2 polygon's geodesic area. Dimensions: 'hazard' (flood,
-- overland, coastal ×2, liquefaction) and 'planning' (heritage, zoning,
-- intensification). Breakdown units are km² with a 'Total' category row —
-- the UI computes shares client-side like the census breakdowns.
-- ============================================================================

insert into sources (source_key, name, publisher, url, licence, tier) values
  ('ac_flood_plains', 'Flood Plains (1% AEP)',
   'Auckland Council (Healthy Waters)',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::flood-plains/about',
   'CC BY 4.0; attribution: Auckland Council', 1),
  ('ac_overland_flow', 'Overland Flow Paths',
   'Auckland Council (Healthy Waters)',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::overland-flow-paths/about',
   'CC BY 4.0; attribution: Auckland Council', 1),
  ('ac_coastal_inundation', 'Coastal Inundation 1% AEP',
   'Auckland Council',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::coastal-inundation-1-aep/about',
   'CC BY 4.0; attribution: Auckland Council (TR2020/24)', 1),
  ('ac_coastal_inundation_slr1m', 'Coastal Inundation 1% AEP +1m sea level rise',
   'Auckland Council',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::coastal-inundation-1-aep-1m-sea-level-rise/about',
   'CC BY 4.0; attribution: Auckland Council (TR2020/24)', 1),
  ('ac_liquefaction', 'Liquefaction Vulnerability Calibrated Assessment',
   'Auckland Council / University of Auckland Uniservices',
   'https://data-aucklandcouncil.opendata.arcgis.com/maps/liquefaction-vulnerability-calibrated-assessment-1',
   'CC BY 4.0; attribution: Auckland Council + "Liquefaction Vulnerability Maps for the Auckland Region", Altaf/Wotherspoon/Orense, UoA Uniservices', 1),
  ('ac_heritage_overlay', 'Historic Heritage Overlay Extent of Place',
   'Auckland Council (Plans and Places)',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::historic-heritage-overlay-extent-of-place/about',
   'CC BY 4.0; attribution: Plans and Places, Auckland Council', 1),
  ('ac_unitary_plan_zones', 'Unitary Plan Base Zone (AUP July 2026)',
   'Auckland Council (Plans and Places)',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::unitary-plan-base-zone/about',
   'CC BY 4.0; attribution: Plans and Places, Auckland Council', 1)
on conflict (source_key) do nothing;

insert into metric_definitions (metric_key, label, dimension, unit, value_type, higher_is_better, description, display_order) values
  ('flood_plain_pct', 'Flood plain (1% AEP)', 'hazard', '%', 'scalar', null,
   'Share of the SA2 area inside the 1% AEP flood plain (max probable development + climate change model). Area-level model — not a property assessment.', 20),
  ('overland_flow_density', 'Overland flow path density', 'hazard', 'km/km²', 'scalar', null,
   'Overland flow path length per km² of SA2 area (2016/17 LiDAR re-map). Area-level model — not a property assessment.', 21),
  ('coastal_inundation_pct', 'Coastal inundation (1% AEP)', 'hazard', '%', 'scalar', null,
   'Share of the SA2 area inside present-day coastal storm-tide inundation, 1% AEP (TR2020/24). Area-level model — not a property assessment.', 22),
  ('coastal_inundation_slr1m_pct', 'Coastal inundation (1% AEP, +1m sea level)', 'hazard', '%', 'scalar', null,
   'Share of the SA2 area inside coastal inundation 1% AEP assuming +1 m sea-level rise (TR2020/24). Area-level model — not a property assessment.', 23),
  ('liquefaction_share', 'Liquefaction vulnerability', 'hazard', 'km²', 'breakdown', null,
   'SA2 area by liquefaction vulnerability class (Calibrated Assessment, UoA Uniservices 2022). Neighbourhood-scale desktop assessment — not property-specific.', 24),
  ('heritage_overlay_pct', 'Heritage overlay', 'planning', '%', 'scalar', null,
   'Share of the SA2 area inside the AUP Historic Heritage Overlay (Extent of Place).', 30),
  ('zoning_share', 'Zoning mix', 'planning', 'km²', 'breakdown', null,
   'SA2 area by Auckland Unitary Plan base-zone bucket (AUP July 2026).', 31),
  ('intensification_capacity_indicator', 'Intensification capacity', 'planning', '%', 'scalar', null,
   'Mixed Housing Urban + Terrace Housing & Apartment share of residential-zoned land — a development-capacity indicator, not a forecast.', 32)
on conflict (metric_key) do nothing;

select http_set_curlopt('CURLOPT_TIMEOUT', '120');

with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/hazards/tri68-hazard-metrics.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (g text, m text, c text, v numeric, d date, cf text)
),
src_map as (
  select * from (values
    ('flood_plain_pct',                    'ac_flood_plains'),
    ('overland_flow_density',              'ac_overland_flow'),
    ('coastal_inundation_pct',             'ac_coastal_inundation'),
    ('coastal_inundation_slr1m_pct',       'ac_coastal_inundation_slr1m'),
    ('liquefaction_share',                 'ac_liquefaction'),
    ('heritage_overlay_pct',               'ac_heritage_overlay'),
    ('zoning_share',                       'ac_unitary_plan_zones'),
    ('intensification_capacity_indicator', 'ac_unitary_plan_zones')
  ) as t (metric_key, source_key)
)
insert into metric_values (geo_id, metric_id, category, value_num, source_id, as_of_date, confidence)
select geo.id, md.id, r.c, r.v, s.id, r.d, r.cf
from r
join geographies geo on geo.sa2_code = r.g and geo.geo_type = 'SA2'
join metric_definitions md on md.metric_key = r.m
join src_map on src_map.metric_key = r.m
join sources s on s.source_key = src_map.source_key
on conflict (geo_id, metric_id, category, as_of_date) do update
  set value_num = excluded.value_num, source_id = excluded.source_id, confidence = excluded.confidence;

refresh materialized view concurrently regional_metric_stats;
