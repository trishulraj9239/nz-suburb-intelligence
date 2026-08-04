# TRI-72 spike — Stats NZ building consents geography

**Date**: 2026-08-04 · **Timebox**: 1.5 h (spent ~0.5 h) · **Status**: findings complete, checkpoint pending

## Verdict up front

**SA2-level data exists and matches our geography exactly — no local-board
fallback needed.** The monthly *Building consents issued* release ships a
supplementary CSV "New dwellings consented by 2023 statistical area 2
(Monthly)" using the same SA2 2023 codes as `geographies`. The TRI-72
checkpoint condition ("if falling back to local board, label it") dissolves;
the remaining decisions for sign-off are listed at the bottom.

## The file

- **Release**: Building consents issued (monthly, Stats NZ). Latest at spike
  time: May 2026 (published ~1 July 2026 → ≈2-month lag).
- **Download**: each release page carries
  `new-dwellings-consented-by-statistical-area-2-<month>-<year>.zip`
  under `/assets/Uploads/Building-consents-issued/Building-consents-issued-<Month>-<Year>/Download-data/`.
  Verified live: [May 2026 zip](https://www.stats.govt.nz/assets/Uploads/Building-consents-issued/Building-consents-issued-May-2026/Download-data/new-dwellings-consented-by-statistical-area-2-may-2026.zip)
  (7.7 MB, HTTP 200, Last-Modified 2026-07-01).
- **Contents**: TWO vintages per zip — "…by **2023** statistical area 2" and
  "…by **2026** statistical area 2" (~61 MB each unzipped, ~1.04 M rows,
  national). **Use the 2023 file** — direct join to our SA2 codes, zero
  concordance work. (The 2026-vintage file is the future-proofing path if the
  app ever re-bases boundaries.)
- **Zip gotcha**: compressed with a method `Expand-Archive` can't read
  (Stats NZ's pages say "use 7-Zip"). **Windows `tar.exe` (bsdtar) extracts it
  fine** — no new tooling needed in the ETL.

## Schema (verified from the file)

```
month,SA2_code,SA2_name,territorial_authority,total_dwelling_units,houses,apartments,retirement_village_units,townhouses_flats_units_other
1990-04-01,100100,North Cape,Far North District,2,2,0,0,0
```

- Monthly from **1990-04** through the release month (2026-05 at spike time).
- `SA2_code` = SA2 2023 (7-digit-less codes identical to ours).
- Counts of **new dwellings consented** (units), with dwelling-type splits.
  SA2 is available for *number of new dwellings only* — value/floor-area
  measures stop at TA level (confirmed on DataInfo+), which is fine: TRI-73's
  metrics only need counts.
- **Zeros are explicit rows, not suppressed gaps** — months with no consents
  appear as `0`. No suppression observed (administrative counts; unlike census
  confidentialised tables). Absence-of-row handling is NOT needed here.

## Coverage checks (run against the real file)

| Check | Result |
|---|---|
| Our 633 SA2s present | **633/633** |
| Latest month | 2026-05 |
| Auckland new dwellings, Jun 2025–May 2026 | **16,862** (national YE May 2026 = 39,737 per the release — Auckland ≈42%, plausible) |
| Takapuna Central, last 12 m | 12 |

## Licence

Stats NZ web content and data: **CC BY 4.0** (same site-wide licence already
recorded for the census loads in `docs/sources.md` — attribution "Stats NZ").
Source row for TRI-73: `stats_building_consents`, tier 1.

## TRI-73 feasibility notes

- `consents_new_dwellings_12m` — rolling 12-month sum per SA2, monthly
  `as_of_date` for the last ~24 months → sparkline via the M13 history
  mechanism. Trailing window computable locally from the one CSV.
- `consents_per_1000_dwellings` — denominator = census 2023 dwelling counts
  (the `dwelling_type` breakdown Total already in `metric_values`).
- The release URL is **month-stamped** — a refresh means resolving the newest
  release's URL (predictable pattern) and re-running; pairs with the TRI-75
  checkpoint question about a monthly cron vs manual refresh.
- Raw CSV (61 MB) stays out of the repo (gitignored, TRI-68 posture); only
  the computed metric artifact is committed.

## Checkpoint decisions for sign-off

1. **Geography = SA2 2023 direct** (target met; no fallback, no relabelling).
2. **Vintage file = the "2023 SA2" CSV** from each release zip.
3. **Measures = dwelling-unit counts** (total + splits available). Metric v1
   uses `total_dwelling_units`; type splits are a possible later breakdown —
   propose NOT loading them in TRI-73 (registry stays lean; splits add ~4×
   rows for a question nobody has asked yet).
4. **History depth**: ticket says trailing 5 years. The file goes back to
   1990 — propose loading the rolling-12m series for the last 24 monthly
   as_of_dates only (sparkline needs no more; matches the M13 rent-history
   posture), computed over 3 years of raw months.
