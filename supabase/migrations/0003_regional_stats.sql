-- ============================================================================
-- NZ Suburb Intelligence — Regional metric stats (migration 0003, TRI-21)
-- Materialized view powering the percentile-vs-region bars in profile/compare
-- scorecards, without storing a stale percentile on every value row.
--
-- Scope: scalar values only (category IS NULL) over ACTIVE geographies.
-- Grain: (region_code, metric_id, as_of_date) — the time series keeps each
-- census year's distribution separate.
-- Refresh after each ingestion:
--   refresh materialized view concurrently regional_metric_stats;
-- (the unique index below is what makes CONCURRENTLY legal)
-- ============================================================================

create materialized view regional_metric_stats as
select
  g.region_code,
  mv.metric_id,
  md.metric_key,
  mv.as_of_date,
  count(*)::int                                            as n,
  min(mv.value_num)                                        as min,
  percentile_cont(0.25) within group (order by mv.value_num) as p25,
  percentile_cont(0.5)  within group (order by mv.value_num) as median,
  percentile_cont(0.75) within group (order by mv.value_num) as p75,
  max(mv.value_num)                                        as max
from metric_values mv
join geographies g        on g.id = mv.geo_id and g.is_active
join metric_definitions md on md.id = mv.metric_id
where mv.category is null
  and mv.value_num is not null
group by g.region_code, mv.metric_id, md.metric_key, mv.as_of_date;

create unique index regional_metric_stats_key
  on regional_metric_stats (region_code, metric_id, as_of_date);

-- Public aggregates over public data — same read posture as the base tables.
grant select on regional_metric_stats to anon, authenticated;
