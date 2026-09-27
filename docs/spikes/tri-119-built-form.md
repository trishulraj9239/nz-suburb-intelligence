# TRI-119 spike — built form from LINZ Building Outlines + Property Boundaries

**Date**: 2026-09-27 · **Timebox**: 1.5 h · **Status**: findings complete;
built under the autonomous-gate rule.

## Verdict

**Three built-form indicators per SA2 are derivable from two open LINZ
layers**: building footprint coverage, buildings per hectare, and median
rating-unit size. They describe what is physically there, beside the
Planning dimension's "what is allowed" (zoning, capacity, consents). All
three are information, never a verdict.

## Sources (verified live 2026-09-27)

| Layer | Auckland volume | Fields used | Vintage |
|---|---|---|---|
| 101290 NZ Building Outlines (CC BY 4.0, PK `building_id`) | 767,998 in the TRI-44 box | geometry only | published 2026-05-18; imagery 2024–2025 for most of Auckland (`capture_source_*`) |
| 122657 NZ Property Boundaries (CC BY 4.0, PK `source_id`) | 776,539 in the box (725,247 with TA = Auckland) | `area` (m², LINZ-computed) + geometry | published 2026-09-24, weekly-refreshed |

Both are ~10× the ticket's estimate, so the ETL streams them through paged
WFS (20k/page) with a JSONL checkpoint in gitignored `tmp/built-form/`,
reducing each feature to `{ sa2, area }` at fetch time — nothing large is
kept in memory or committed.

## Method

- **SA2 assignment**: building centre / property point-on-surface →
  point-in-SA2 (`scripts/etl/lib/sa2-point.mjs`, the TRI-44 clip rule).
  Features whose point lands outside the 633 SA2s are dropped.
- `building_footprint_pct` = Σ turf.area(outline) ÷ Stats NZ
  `LAND_AREA_SQ_KM` × 100. `buildings_per_ha` = count ÷ land ha.
  `median_property_m2` = median of LINZ `area` over rating units in the SA2
  (≥ 20 units).
- Land area is Stats NZ's, not the generalised map polygon's.

## Decisions

1. Registry: `building_footprint_pct`, `buildings_per_ha` (confidence
   `medium`: imagery-derived, centre-assigned) and `median_property_m2`
   (`high`: exact published areas) — all `higher_is_better` NULL, in the
   `planning` dimension after the consents metrics.
2. **No residential filter** on the median: Auckland is not in LINZ's open
   DVR (TRI-132), so there is no open property-category field to filter on.
   The description says "all property types". A zoning-polygon filter is
   deferred (TRI-128 will bring AUP polygons to the DB).
3. No building height (needs LiDAR DSM−DEM; later).
4. Vintage: layer publish dates; the imagery-year range is in the
   description. Refresh: re-run when LINZ republishes outlines (~yearly).
5. Shares the Auckland outlines clip with TRI-127 (per-property footprint):
   the JSONL checkpoint is the reusable intermediate.
