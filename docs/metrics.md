# Metric registry reference

The registry (`metric_definitions` + `metric_values`) is the app's spine:
**metrics are data, not code**. The profile, Compare, map shading, the NL
planner prompt, and persona weighting all iterate the registry — adding a
metric is an ETL insert, never a UI change. This file is the human-readable
snapshot (2026-08-04, 26 metrics); the DB is the source of truth.

## Semantics

- **`higher_is_better`** — `true`/`false` drives the percentile-bar colouring
  and "lower is better" hints; **`NULL` means "information, never a verdict"**
  (deprivation, ethnicity, every hazard/planning metric). The NL layer is
  told the direction per weighted metric and is barred from composites.
- **`value_type`** — `scalar` rows (`category IS NULL`) render as metric rows
  with percentile-vs-region bars; `breakdown` rows carry per-`category`
  values plus a `Total` row, rendered as composition (shares computed
  client-side). `zoning_share` renders as the stacked bar.
- **History / sparklines** — a scalar with multiple `as_of_date`s gets a
  sparkline when it has ≥ 8 points (`MIN_TREND_POINTS`); ranks always use the
  latest vintage per metric (TRI-64). Census metrics keep their 2-3 vintages
  (below the gate — deltas render instead).
- **`confidence`** — `high` (exact source value) / `medium` (estimated or
  mapped) / `low` (weak inheritance) / `derived` (computed client-side, e.g.
  road distances). Rendered as chips on every surface.
- Suppressed source cells are **absent rows, never zeros** (MBIE rent);
  administrative counts with true zeros keep explicit zero rows (consents).

## Registry (by dimension, display order)

| Key | Label | Unit | Type | Better | Vintages | Source |
|---|---|---|---|---|---|---|
| **people** ("People") |
| `population` | Population | count | scalar | — | 2013/18/23 | Census |
| `median_age` | Median age | years | scalar | — | 2013/18/23 | Census |
| `ethnicity` | Ethnicity | count | breakdown | — | 2013/18/23 | Census |
| `median_household_income` | Median household income | $/year | scalar | higher | 2013/18/23 | Census |
| **housing** ("Housing") |
| `rent_median_weekly` | Median rent (new tenancies) | $/week | scalar | lower | 25 quarters (2020Q1–2026Q1) | MBIE bonds |
| `median_rent_weekly` | Median weekly rent | $/week | scalar | — | 2013/18/23 | Census |
| `tenure` | Home ownership | count | breakdown | — | 2013/18/23 | Census |
| `dwelling_type` | Dwelling types | count | breakdown | — | 2013/18/23 | Census |
| `rent_lower_quartile_weekly` | Lower-quartile rent | $/week | scalar | lower | latest quarter | MBIE bonds |
| `rent_upper_quartile_weekly` | Upper-quartile rent | $/week | scalar | lower | latest quarter | MBIE bonds |
| `rent_trend_12m_pct` | Rent change (12 months) | % | scalar | — | latest quarter | MBIE bonds |
| **deprivation** ("Deprivation") |
| `nzdep_decile` | Deprivation decile | decile | scalar | — | 2018 | NZDep2018 |
| `nzdep_score` | Deprivation score | score | scalar | — | 2018 | NZDep2018 |
| **commute** ("Getting around") |
| `commute_cbd_drive_min` | Drive to CBD | min | scalar | lower | 2026 | ORS/OSM |
| `commute_cbd_cycle_min` | Cycle to CBD | min | scalar | lower | 2026 | ORS/OSM |
| `commute_cbd_walk_min` | Walk to CBD | min | scalar | lower | 2026 | ORS/OSM |
| `commute_airport_drive_min` | Drive to Airport | min | scalar | lower | 2026 | ORS/OSM |
| **hazard** ("Hazard screen" — all verdict-free, verbatim caveat on every surface) |
| `flood_plain_pct` | Flood plain (1% AEP) | % | scalar | — | 2026 | Auckland Council |
| `overland_flow_density` | Overland flow path density | km/km² | scalar | — | 2026 | Auckland Council |
| `coastal_inundation_pct` | Coastal inundation (1% AEP) | % | scalar | — | 2025 | Auckland Council |
| `coastal_inundation_slr1m_pct` | Coastal inundation (+1 m SLR) | % | scalar | — | 2025 | Auckland Council |
| `liquefaction_share` | Liquefaction vulnerability | km² | breakdown | — | 2022 | AC / UoA Uniservices |
| **planning** ("Planning") |
| `heritage_overlay_pct` | Heritage overlay | % | scalar | — | AUP Jul 2026 | Auckland Council |
| `zoning_share` | Zoning mix | km² | breakdown | — | AUP Jul 2026 | Auckland Council |
| `intensification_capacity_indicator` | Intensification capacity | % | scalar | — | AUP Jul 2026 | Auckland Council |
| `consents_new_dwellings_12m` | New dwellings consented (12 m) | — | scalar | — | 24 months (rolling 12 m) | Stats NZ |
| `consents_per_1000_dwellings` | Consenting rate | /1k dwellings | scalar | — | latest month | Stats NZ |

Sources, licences, quotas, and refresh procedures: `docs/sources.md`.
Per-source decision records: `docs/spikes/`. Deferred registry scope is
tracked on the Linear board (e.g. TRI-77 consents splits).
