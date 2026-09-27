# TRI-118 spike — Census 2023 housing quality at SA2

**Date**: 2026-09-27 · **Timebox**: 1 h (spent ~1 h) · **Status**: findings
complete; built under the autonomous-gate rule (decisions posted to the ticket).

## Verdict up front

**Damp, mould, heating, bedrooms and dwelling density are all published at
SA2-2023 by Stats NZ, keyless and CC BY 4.0** — but not through the route the
ticket assumed. Our `STATS_NZ_API_KEY` is an Aotearoa Data Explorer key and
has no datafinder WFS scope (`Feature type … unknown`, the same limitation
TRI-16 hit). Stats NZ Geospatial mirrors every datafinder census layer as an
ArcGIS Online feature service under the same licence, so the ETL reads those
(the hazard ETL's pattern), with the datafinder lookup-table attachments as
the column dictionary.

## Sources (verified live 2026-09-27)

| Table | datafinder | ArcGIS Online (used) | Rows |
|---|---|---|---|
| 2023 Census totals by topic for dwellings by SA2 | layer 120853 (published 2024-12-18) | `services2.arcgis.com/vKb0s8tBIA3bdocZ/…/2023_Census_totals_by_topic_for_dwellings_by_SA2/FeatureServer/0` | 2,311 (clipped) |
| 2023 Census change in occupied and unoccupied private dwellings by SA2 | layer 119481 | `…/2023_Census_change_in_occupied_and_unoccupied_private_dwellings_by_SA2/FeatureServer/0` | 2,311 |
| Lookup tables (VAR code → variable/year/category) | attachments 25546 and 25372 | — | 221 / 25 lines |

- Owner `StatsNZGeospatial`, item licence *"CC BY 4.0 Deed | Attribution 4.0
  International"*; `maxRecordCount` 2000; `f=json` attribute-only queries.
- The "(clipped)" services drop water-only SA2s: 2,311 vs 2,395 on
  datafinder. **627 of our 633** Auckland SA2s are present; the 6 absent are
  inlets/oceanic with no dwellings.
- "2023 Census housing data by SA2" (layer 122391, the *Housing in Aotearoa
  2025* companion) exists on AGOL too but only repackages the same counts as
  percentages; we compute shares from the counts so denominators are explicit.

## Column mapping (transcribed from the lookup tables)

| Metric | 2013 | 2018 | 2023 |
|---|---|---|---|
| Damp: always / sometimes / Total stated | — | VAR_3_23 / 24 / 28 | VAR_3_29 / 30 / 34 |
| Mould: always / sometimes / Total stated | — | VAR_3_35 / 36 / 40 | VAR_3_41 / 42 / 46 |
| Heating: no heating / heat pump / Total stated | — | VAR_3_123 / 124 / 134 | VAR_3_135 / 136 / 146 |
| Average bedrooms (mean) | VAR_3_155 | VAR_3_164 | VAR_3_173 |
| Bedrooms 1/2/3/4/5+ / Total stated | VAR_3_147–151 / 154 | VAR_3_156–160 / 163 | VAR_3_165–169 / 172 |
| Total dwellings (change layer) | VAR_1_3 | VAR_1_6 | VAR_1_9 |
| Land area | `LAND_AREA_SQ_KM` on the change layer | | |

## Data behaviour

- **Suppression sentinel is `-999`** (not null): 9 Auckland SA2s are fully
  confidentialised (industrial / hospital / harbour SA2s such as Takanini
  Industrial, Botany Central, Middlemore). Treated as absent, never zero.
- Counts are random-rounded to base 3; 10 SA2s have a damp "Total stated"
  under 30. A 3-dwelling rounding step on a 12-dwelling denominator is a
  25-point swing, so **percentage metrics require ≥ 30 stated dwellings**.
- "Total stated" excludes "Not elsewhere included" — the denominator Stats NZ
  itself uses for percentage tables.
- Heating is **multi-response** (a dwelling can list several types). Only
  single-category shares are emitted (heat pump, no heating); a "heating mix"
  breakdown would render as a stacked bar summing past 100%.
- Spot check Ponsonby West 2023: damp 23.0%, mould 17.2%, heat pump 62.0%,
  avg 3.1 bedrooms; land area 0.648 km².

## Decisions

1. **Seven registry entries in `housing`** (display order 11–17):
   `dwelling_damp_pct`, `dwelling_mould_pct` (**lower is better** — the
   only verdict-carrying pair, they measure living conditions, not people),
   `avg_bedrooms`, `bedrooms` (breakdown), `heat_pump_pct`, `no_heating_pct`,
   `dwelling_density_per_km2` (all `higher_is_better` NULL).
2. **Confidence `high`** on every row: exact published counts/means, same
   vintage numerator and denominator, Stats NZ's own land area.
3. **No overlap with TRI-17**: `dwelling_type` and `tenure` stay as loaded;
   this ticket adds only new variables.
4. **Vintages**: 2018 + 2023 for damp/mould/heating (first asked in 2018);
   2013/2018/2023 for bedrooms and density → deltas render, no sparklines
   (below the 8-point gate).
5. **Persona emphasis**: renter weights damp/mould 1.25; buyer weights
   average bedrooms 1.25. Emphasis only — never a score.
6. **Re-embed deferred** to TRI-140 (Gemini daily quota already ~2/3 spent).

## Copy carried into the UI

- Housing section explainer names the source, the rounding/suppression
  rules and the 30-dwelling gate.
- Damp/mould descriptions say "share of dwellings that answered" and that
  the count is self-reported at census night.
