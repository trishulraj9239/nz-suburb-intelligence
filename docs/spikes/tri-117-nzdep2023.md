# TRI-117 spike — NZDep2023 as the current deprivation vintage

**Date**: 2026-09-27 · **Timebox**: 1 h (spent ~1 h, most of it on the licence) ·
**Status**: findings complete; built under the autonomous-gate rule (findings
posted to the ticket, one item flagged for human re-check below).

## Verdict up front

**NZDep2023 is published on SA2-2023 codes, so it joins the app's spine
directly** — no concordance, no parent-code inheritance, every row
confidence `high`. The 2018 rows stay as the earlier vintage so the profile
shows a 2018→2023 delta and ranks use the latest vintage (TRI-64). The only
wrinkle is *where* to read it from: Otago's site blocks automated fetches.

## Source

- **Publisher**: University of Otago, Wellington — Health Inequalities
  Research Programme (HIRP). Atkinson J, Salmond C, Crampton P, Viggers H,
  Lacey K (2024). *NZDep2023 Index of Socioeconomic Deprivation* (research
  report + user's manual, 31 Oct 2024). The index is built from nine Census
  2023 variables at SA1 and published as SA1 deciles/scores plus
  population-weighted averages at SA2 (`NZDep2023_WgtAvSA2.xlsx`).
- **Files on otago.ac.nz** (all behind a Cloudflare "Just a moment" challenge
  for non-browser clients — `curl`, WebFetch and a headless tab all got the
  interstitial; we do not attempt to pass bot challenges):
  - SA2 weighted averages: `https://www.otago.ac.nz/__data/assets/excel_doc/0024/593142/NZDep2023_WgtAvSA2.xlsx`
  - User's manual: `https://www.otago.ac.nz/__data/assets/pdf_file/0027/593136/NZDep2023-Users-Manual-31-October-2024.pdf`
  - Research report: `https://www.otago.ac.nz/__data/assets/pdf_file/0026/593135/NZDep2023-Research-Report-31-October-2024.pdf`
- **Mirror actually read by the ETL**: the Massey University / EHINZ
  ("Healthspace") ArcGIS feature service that powers the official NZDep2023
  webmap — the same channel TRI-18 used for NZDep2018:
  `https://services6.arcgis.com/ZVM1rEuVZjtC1Wwk/arcgis/rest/services/New_Zealand_Index_of_Deprivation_2023_WFL1/FeatureServer/1`
  (SA2 layer, 2,292 rows; fields `SA22023_code`, `SA22023_name`,
  `SA2_average_NZDep2023`, `SA2_average_NZDep2023_score`; layer 0 is SA1 with
  32,746 rows — the input for the TRI-130 "your block" ticket). Keyless,
  public, `f=json`, paged at 2,000.

## Licence (the item to re-check by hand)

- A search-engine copy of the **User's Manual** states the work is licensed
  **Creative Commons Attribution 4.0 International** with the citation above.
  The manual itself could not be opened by any automated route on
  2026-09-27 because of the Cloudflare challenge. **Human check requested:**
  open the manual in a normal browser and confirm the licence page reads CC
  BY 4.0. If it does not, the 2023 rows must be pulled (they are isolated on
  `source_key = 'nzdep_2023'`, so `delete from metric_values where source_id =
  (select id from sources where source_key='nzdep_2023')` is the whole
  rollback).
- Precedent: NZDep2018 is recorded in the app as CC BY 4.0 via the same
  Massey mirror (`sources.nzdep_2018`, backfilled in migration 0006).
- **Attribution string** (source row + UI chip): *"NZDep2023 · University of
  Otago (Atkinson et al. 2024) · CC BY 4.0"*.

## Coverage (run against the live service, 2026-09-27)

| Check | Result |
|---|---|
| National SA2 rows | 2,292 (23 with no value) |
| Auckland SA2 universe | 633 |
| Matched with a decile | **618** |
| Present but null (no population) | 9 |
| Not in the file at all | 6 — `110300`, `110600`, `111000`, `112001`, `141400`, `147300` (inlets / oceanic / island SA2s) |
| Ponsonby West (130400) | decile **4**, score 951 |
| Auckland decile distribution | 1: 50 · 2: 80 · 3: 71 · 4: 72 · 5: 57 · 6: 45 · 7: 52 · 8: 52 · 9: 54 · 10: 85 |

The ETL prints the 2018→2023 decile-change histogram at run time for the
ticket comment.

## Decisions

1. **Keep NZDep2018 rows** (as_of 2018-03-06, `source_key nzdep_2018`,
   confidence medium/low as loaded by TRI-18). Add NZDep2023 rows (as_of
   2023-03-07, `source_key nzdep_2023`, confidence `high`). Nothing deleted.
2. **Direct SA2-2023 join only.** No parent inheritance for 2023 rows; a
   suburb with no 2023 value simply keeps its 2018 row as its latest vintage
   — the confidence chip already says `medium`/`low` there.
3. **Vintage-neutral registry labels** ("Deprivation decile", "Deprivation
   score"); the source chip carries the year. Section explainer, planner and
   answer prompts say "NZDep2023 (current), NZDep2018 kept for change".
4. **Profile embeddings** re-embed with the NZDep2023 sentence (milestone
   convention: retrieval text and displayed values never disagree).
5. **Cadence**: none until NZDep2028 (or whatever follows the 2028 census).
   No refresh script needed.

## Interpretation caveats carried into copy

- NZDep is **relative**: 10% of areas are always decile 10. A suburb moving
  from 5 to 6 means its *rank* among NZ areas moved, not that conditions
  worsened in absolute terms (EHINZ wording). The delta copy says "moved
  from decile 5 to 6 (relative to all NZ areas)".
- The nine input variables changed slightly between 2018 and 2023 (Otago
  report); deciles remain comparable as ranks.
- `higher_is_better` stays NULL — information, never a verdict.
