# Spike: MBIE rental-bond CSV — live rent at SA2 (TRI-62)

**Date:** 2026-07-31 · **Verdict: ✅ usable — but quarterly (not monthly) at SA2, on
SA2-2019 codes.** Live-probed: full 11.8 MB CSV downloaded and profiled against our
633 SA2-2023 geographies. Two plan corrections and one concordance decision below
need sign-off at this checkpoint before any insert.

## The files (all keyless, stable asset URLs)

| File | Geography | Cadence | Span | Size |
|---|---|---|---|---|
| `detailed-quarterly-tenancy-2020-to-2026.csv` | **SA2-2019** | quarterly | 2020Q1–2026Q1 (25 qtrs) | 11 MB |
| `detailed-quarterly-tenancy-93-to-19.zip` | mixed | quarterly | 1993–2019 | 13 MB |
| `detailed-monthly-tla-tenancy-v3.csv` | TLA | monthly | 1993-02–2026-05 | 2.2 MB |
| `detailed-monthly-region-tenancy-v3.csv` | Region | monthly | 1993-02–2026-05 | 617 KB |

Base: `https://www.tenancy.govt.nz/assets/Uploads/Tenancy/Rental-bond-data/<file>`
(landing page: tenancy.govt.nz → About → Data and statistics → Rental bond data).
File names are versioned (`-v3`, year-ranged) → **treat the URL as semi-stable**: the
ETL should fail loudly on 404 rather than silently, and the year range in the
quarterly file name will roll over at some point.

- **Sub-monthly plan correction #1:** the brief/plan assumed "trailing 24 months" at
  SA2. **Monthly exists only at TLA/Region** (Auckland is a single TLA → one
  city-wide monthly series, no suburb resolution). SA2 = quarterly only.
  → Proposal: quarterly series, trailing 25 quarters (the whole 2020–2026 file).
- The 1993–2019 archive is skippable for v1 (pre-2020 SA2 vintages differ again;
  sparkline from 2020 is already 25 points).

## Licence

**CC-BY 3.0 NZ**, attribution: "The Ministry of Business, Innovation and
Employment". Open — clears the licence gate. Attribution string goes in the
`sources` row + `docs/sources.md`. Note the site says data queries are handled by
**Ministry of Housing and Urban Development** (Te Tūāpapa Kura Kāinga); source row
should still credit MBIE per the licence statement.

## Column dictionary (verified from file)

`TimeFrame, Location Id, Dwelling Type, Number Of Beds, Total Bonds, Active Bonds,
Closed Bonds, Median Rent, Geometric Mean Rent, Upper Quartile Rent, Lower Quartile
Rent, Log Std Dev Weekly Rent`

- **TimeFrame** — `d/mm/yyyy` (NZ order), first day of quarter: `1/01/2026` = 2026 Q1.
  Header row has a UTF-8 BOM (`﻿TimeFrame`) — strip in the ETL.
- **Location Id** — SA2-2019 code (6-digit), plus sentinels `-99` (national roll-up)
  and `NULL` (location unknown). Drop both sentinels.
- **Dwelling Type** — `ALL, Apartment, Boarding House, Flat, House, Room`.
- **Number Of Beds** — `ALL, NA, 0–9, 5+`.
- **Rents** — weekly NZD. Stats are computed from **bonds lodged (new tenancies),
  listed by tenancy start date** — this is *new-let rent*, not stock-wide rent.
  Frame it that way in UI copy ("median rent of new tenancies").
- Suppression: **cells with <5 bonds are omitted entirely (row absence)** — matches
  our "suppression = row absence, never zero" rule with no transformation. In the
  latest quarter, zero rows carry NULL medians at SA2 level; NULLs only appear on
  the sentinel roll-ups. Fixed random rounding to base 3 on counts.
- Publication lag: quarterly file currently ends 2026 Q1 (today: 2026-07-31), i.e.
  ~1 quarter behind + 10–15 working days processing. MBIE flags the data as
  **provisional** during their bond-system migration — carry `confidence: medium`.

## SA2 vintage — the concordance question (needs sign-off)

The file is on **SA2-2019**; our geographies are **SA2-2023**. Profiled against all
633 of our codes, using dwelling `ALL` / beds `ALL`:

- **357 codes match directly** (SA2-2023 kept the 2019 code where boundaries didn't
  change). 335 of them have a 2026 Q1 row; 269 have all 25 quarters; only 14 have
  fewer than 8 quarters.
- **254 of the 276 non-matching codes map via the TRI-18 parent rule** (2023 split
  codes `XXXXnn` → 2019 parent `XXXX00` present in the file).
- **22 map to nothing** — all legitimately rental-free: oceanic/inlet zones, Gulf
  Islands, Riverhead Forest, Auckland Airport, industrial SA2s (Mt Wellington
  Industrial, Wairau Valley, Rosebank Peninsula…). Correct handling: no row at all.

→ **Proposal (mirrors TRI-18 NZDep precedent):** direct match `confidence: medium`
(provisional data caps it below high); parent-rule match `confidence: low` with the
parent's values applied to each split child (the value is real for the parent area
that contains the child — same semantics as TRI-18). Effective coverage ≈ 611/633,
~96% of active SA2s.

- **Trend feasibility:** 330 suburbs have a median in both 2026 Q1 and 2025 Q1 →
  YoY trend viable at direct-match level.

## Per-dwelling-type — plan correction #2 (recommend: cut)

At SA2 × latest quarter, beds=ALL medians exist for: House **330**, Apartment
**61**, Flat **15**. Only House has usable coverage, and House≈ALL for most
suburbs. The plan's "per dwelling type only if data supports cleanly" condition
**fails** → load `Dwelling Type = ALL`, `Number Of Beds = ALL` only. (Bedroom
splits are similarly sparse and also cut.)

## Proposed metric definitions (insert at TRI-63, not now)

All in dimension `housing`, source `mbie_tenancy_bonds`, weekly NZD, quarterly
`as_of_date` = quarter start date:

| key | definition | higher_is_better | rows |
|---|---|---|---|
| `rent_median_weekly` | Median weekly rent, new tenancies (bonds lodged), all dwellings | `false` | ~611 × 25 qtrs ≈ 14k |
| `rent_lower_quartile_weekly` | Lower-quartile weekly rent, new tenancies | `false` | latest quarter only |
| `rent_upper_quartile_weekly` | Upper-quartile weekly rent, new tenancies | `false` | latest quarter only |
| `rent_trend_12m_pct` | Median rent change vs same quarter prior year | **`NULL`** | latest quarter only, both endpoints required else absent |

- Full 25-quarter history only for the median (feeds the existing sparkline
  mechanism); quartiles/trend latest-only keeps row count ≈ 16k and the citation
  block clean. (Depends on TRI-64 latest-per-metric landing first — unchanged.)
- **Minimum-quarters rule (proposal):** show the sparkline/trend only when the
  suburb has ≥ 8 quarters of median history; below that render the latest value
  alone. 343/357 direct-match suburbs pass today.
- Source chip: "MBIE Tenancy bonds · 2026 Q1" (quarter, not month — plan wording
  update).

## ETL notes for TRI-63

- Plain `curl` download (no key). ~205k rows; filter to ALL/ALL + our 633 codes +
  parent codes → artifact `data/rent/tri63-rent-metrics.json`, likely >10 MB before
  filtering but **well under after** (~16k rows); if over, chunk 2 parts per the
  proven http_get pattern.
- Values arrive pre-rounded (base 3) — store as-is, no further rounding.
- Idempotent upsert on `(geo_id, metric_id, as_of_date)`; refresh
  `regional_metric_stats` concurrently after load. **TRI-65 must verify the
  percentile join picks the latest quarter, not pooled quarters** (risk already in
  plan).
- Spot-check targets for TRI-63 verification (2026 Q1, ALL/ALL, direct codes):
  `110400` median 530 (LQ 420 / UQ 623), `110700` median 513, `110900` median 650.
  Cross-check Auckland TLA monthly file for the same period as a sanity band.

## Checkpoint decisions — LOCKED (signed off 2026-07-31)

1. **Quarterly cadence accepted** — trailing 25 quarters (full 2020–2026 file);
   plan wording changes from "month" to "quarter" throughout M13.
2. **Parent-rule concordance accepted** — direct match `confidence: medium`,
   parent `XXXX00` match `confidence: low` (TRI-18 precedent), ≈611/633 coverage.
3. **Per-dwelling-type/bedroom splits cut** — load `ALL`/`ALL` only. Headline
   metric labelled "all dwelling types, new tenancies"; add an eval trap question
   for apartment/bedroom-specific rent asks (expect honest all-dwellings framing).
   Splits remain a later pure data+config addition if demand shows up.
4. **Minimum-history rule: ≥ 8 quarters** of median history for sparkline/trend;
   below the bar, latest value renders alone.
