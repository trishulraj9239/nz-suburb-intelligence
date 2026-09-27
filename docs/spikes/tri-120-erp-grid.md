# TRI-120 spike — post-census population from the 250 m ERP grid

**Date**: 2026-09-27 · **Timebox**: 45 min · **Status**: findings complete;
built under the autonomous-gate rule.

## Verdict

**Annual 30 June population estimates for 2022–2025 can be attached to every
Auckland SA2 by summing Stats NZ's 250 m population grid by cell centre.**
They are estimates (and provisional for 2024/2025), so they live in their own
metric at confidence `medium`, beside — never inside — the census counts.

## Source (verified live)

- datafinder layer **119709 "New Zealand Estimated Resident Population Grid
  250 metre"**, published 2026-06-25, CC BY 4.0. Fields `GridID`,
  `CENTROID_X/Y` (NZTM), `PopEst2022`, `PopEst2023`, `PopEst2024`,
  `PopEst2025`. 201,693 cells nationally; 28,353 intersect the Auckland
  envelope.
- Stats NZ's own wording: population estimates by SA1 are the input; the
  grids are *"a customised dataset … not official statistics"*. 2022/2023
  final (2023-base), 2024/2025 provisional (published Oct 2025).
- Read from Stats NZ Geospatial's ArcGIS mirror `NZGrid_250m_ERP`
  (FeatureServer layer **1**, `returnCentroid=true`, `outSR=4326`), same
  licence — our `STATS_NZ_API_KEY` has no datafinder WFS scope.
- Also available: 500 m and 1 km grids (coarser; not used).

## Method

**Area-weighted apportionment.** Each cell polygon is intersected with the
SA2 polygons it overlaps (turf); an SA2 receives the cell's population ×
(intersection area ÷ cell area), i.e. uniform density within a cell. The
part of a cell outside every SA2 (coast, region edge) is not counted.

A first attempt used cell **centroid → point-in-SA2** (the TRI-44 clip rule).
That over-assigned small SA2s badly: a 250 m cell is a large share of a
0.5 km² inner suburb, so Ponsonby West came out at 2,540 for June 2023
against a census count of 2,154 (+18 %), and 16 SA2s were off by more than
50 %. Region-wide the two methods agree (both ≈ 6 % above census, which is
the expected ERP-over-census gap: undercount correction + residents
temporarily overseas); only the per-suburb split differs. The ETL prints the
region ratio and any SA2 off by > 50 % so drift stays visible.

## Result of the sanity check (area-weighted run, 2026-09-28)

Region: ERP 2023 = 1,750,435 vs Census 2023 = 1,656,468 over 630 SA2s
(ratio **1.057** — the expected ERP-over-census gap). Ponsonby West 2,355
vs census 2,154 (+9 %; the centroid method gave +18 %). About 20 SA2s still
sit more than 35 % from their census count — sparse SA2s beside dense ones
(industrial blocks next to apartments, e.g. Mount Wellington Industrial)
inherit population under the uniform-density assumption. **Every row for
those SA2s is loaded at confidence `low`** rather than dropped: the chip
carries the warning and the figure stays inspectable.

Roughly 73k of the envelope's 2025 population falls outside the 633 SA2s
(Waikato/Northland edges of the box) and is not counted.

## Decisions

1. Separate metric **`population_estimate`** (people, four vintages
   2022-06-30 … 2025-06-30) + **`population_growth_2y_pct`** (2023→2025,
   omitted where the 2023 estimate is under 100 residents). The census
   `population` series stays pure.
2. Confidence **`medium`** (estimate + apportioned + provisional), dropping
   to **`low`** for an SA2 whose 2023 estimate is outside ×0.65–×1.4 of its
   census count (apportionment artefact, see above).
3. `higher_is_better` NULL — growth is information.
4. Copy: "estimate, not a census count" on the metric description; the
   answer prompt already tells the model to say "approximately" for medium
   confidence.
5. Refresh: annually when Stats NZ republishes the grid (next ~Oct 2026 with
   2026 provisional estimates) — re-run, the year list in the ETL grows.
