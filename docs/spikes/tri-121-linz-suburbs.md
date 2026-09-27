# TRI-121 spike — LINZ suburbs as a name layer over the SA2 spine

**Date**: 2026-09-27 · **Timebox**: 45 min · **Status**: findings complete;
built under the autonomous-gate rule.

## Verdict

**Keep the SA2 as the spine; add LINZ NZ Suburbs and Localities as a
name/alias layer that resolves to SA2s.** Nothing aggregates across SA2s:
"Grey Lynn" resolves to the list of SA2s it covers and every figure is still
cited per area.

## Source (verified live)

- LINZ Data Service layer **113764 NZ Suburbs and Localities**, CC BY 4.0,
  PK `id`, republished ~weekly (last 2026-09-23). Fields used: `name`,
  `name_ascii`, `additional_name` (comma-separated aliases), `type`,
  `major_name`, `population_estimate` (Stats NZ estimate carried by LINZ).
- Auckland TA: **794 features = 210 Suburb + 66 Locality + 372 Coastal Bay +
  134 Island + 12 Lake.** Only Suburb + Locality are neighbourhoods; the rest
  are place names and are excluded.
- 582 of 794 carry `additional_name`; for suburbs these are real aliases:
  *Grey Lynn / Arch Hill*, *Kingsland / Mt Albert*, *Flat Bush / Botany,
  Botany Downs South, Manukau Heights*, *Takapuna / Takapana*.
- Geometry for the 276 kept features is a few MB via WFS; only centre-of-mass
  label points ship to the browser (`public/geo/auckland-suburb-labels.geojson`).

## Overlap method

Intersection area between each suburb polygon and each SA2 polygon
(generalised map polygons, turf), keeping a pair when it covers **≥ 20 % of
the SA2 or ≥ 20 % of the suburb**. Both shares are stored:
`sa2_share` (how much of the SA2 is this suburb) and `suburb_share` (how much
of the suburb is this SA2). Resolution orders SA2s by `suburb_share` so the
first hit is the area that holds most of the suburb.

## Resolution rules (planner + search box)

1. Exact/partial **SA2 name** match first (unchanged behaviour, so current
   eval answers don't move).
2. Else `resolve_suburb(query)`: pg_trgm similarity over name + aliases
   (threshold 0.3 in SQL, caller accepts ≥ 0.35), best suburb only, its SA2s
   by `suburb_share`, up to 3 for lookup/compare and 1 for commute/similar.
3. The answer prompt is told: several rows under one suburb heading mean the
   suburb spans those statistical areas — present each, never average.

## Honesty

- Suburb rows carry no metrics; only `geographies` rows do.
- The search box labels a LINZ hit "suburb · N areas" and selects the area
  holding most of it; the profile header stays the SA2 name.
- Label points show LINZ names at mid zoom; SA2 outlines remain the data
  boundaries.
