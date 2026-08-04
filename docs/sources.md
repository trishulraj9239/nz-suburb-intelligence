# External data sources & API quotas

Registry rows live in the `sources` table (seeded in `0001`, extended in `0006`).
This file records operational facts that don't belong in the DB: observed quotas,
cadence, attribution strings, and gotchas. Stats NZ ADE has its own deep-dive:
`docs/spikes/tri-15-ade-census-2023.md`.

## openrouteservice (ORS) — commute routing

- **What:** hosted routing (directions, matrix, isochrones) over OpenStreetMap
  road data. Used for precomputed SA2→anchor commute times (ETL) and live
  user-destination commutes (`/api/commute`).
- **Auth:** `ORS_API_KEY` — server-only, `.env.local` + Vercel env. Never
  `NEXT_PUBLIC_`.
- **Quotas (observed from response headers, 2026-07-31 — free tier; the
  dashboard is truth, these change):**
  | Endpoint | `X-Ratelimit-Limit` (per day) |
  |---|---|
  | `/v2/directions/{profile}` | 2000 |
  | `/v2/matrix/{profile}` | 500 |
  - Matrix additionally caps routes per request (free tier: 3500
    sources×destinations) — 627 SA2s × 2 anchors = 1254 routes/mode fits in
    one call per mode.
  - Per-minute sliding window also applies (40/min typical); the ETL throttles
    and backs off on 429.
- **Engine snapshot at first test (2026-07-31):** ORS v9.9.0, graph
  2026-07-26, OSM data 2026-07-20.
- **Caveats:**
  - Times are "typical" — **no live traffic**. UI copy: *"typical drive time
    (no live traffic)"*.
  - Coordinates must be within **350 m of a routable road** or the API 404s
    (error 2010). Anchor points are picked road-side (e.g. airport terminal
    drop-off, not the runway). SA2 origins use `ST_PointOnSurface`, and the
    matrix response reports `snapped_distance` per point.
- **Licence / attribution:** road data © OpenStreetMap contributors, **ODbL
  1.0** — attribution required. Official string from the API metadata:
  `openrouteservice.org | OpenStreetMap contributors`.
  - UI source-chip string: **"Routing: openrouteservice · © OpenStreetMap
    contributors (ODbL)"**

## LINZ NZ Addresses — geocoding

- **What:** authoritative NZ address points (LINZ Data Service layer 123113
  "NZ Addresses"), clipped to Auckland region → `addresses` table for
  pg_trgm fuzzy geocoding. No third-party geocode API in the request path.
- **Cadence:** LINZ updates the layer roughly weekly; our table is a one-off
  load, refreshed manually if stale addresses become a problem.
- **Loaded 2026-07-31:** 725,981 rows (full Auckland clip via SA2
  point-in-polygon; 37,891 bbox-spill rows dropped). `addresses` total
  171 MB incl. 43 MB trigram GIN index; whole DB 206 MB of the 500 MB
  free tier. Geocode fn ~95 ms steady-state (don't `lower()` the indexed
  column — trigrams are case-insensitive; wrapping it forces a seq scan).
- **Key note:** needs a data.linz.govt.nz key (`LINZ_LDS_API_KEY`,
  local/ETL only). Keys are per-Koordinates-site — a koordinates.com or
  Basemaps key will NOT work; an unknown key isn't rejected, it just sees
  zero layers ("Feature type unknown").
- **Licence / attribution:** **CC BY 4.0**.
  - UI source-chip string: **"Addresses: Toitū Te Whenua LINZ (CC BY 4.0)"**

## MBIE Tenancy bond data — live rent

- **What:** rents from bonds lodged with Tenancy Services (**new tenancies**, by
  tenancy start date) — median + quartiles per SA2 per quarter. Feeds the
  `rent_*` metrics (dimension `housing`). Deep-dive + locked decisions:
  `docs/spikes/tri-62-mbie-rent-bonds.md`.
- **Auth:** none — keyless CSV downloads from tenancy.govt.nz.
- **Cadence:** SA2 detail is **quarterly** (monthly exists only at TLA/region);
  published ~1 quarter behind + 10–15 working days processing. Refresh = re-run
  `scripts/etl/tri-63-mbie-rent.mjs` → commit/push → `tri-63-rent-metrics.sql`.
- **Caveats:**
  - File is on **SA2-2019** codes; 2023 concordance = exact code (confidence
    `medium`) or parent `XXXX00` rule (confidence `low`); ~611/633 covered, the
    rest have no rental stock.
  - MBIE flags the series **provisional** during their bond-system migration —
    that's why direct matches cap at `medium`.
  - Suppression: cells with <5 bonds are omitted upstream (row absence);
    counts random-rounded base 3. All-dwelling-types aggregate includes
    boarding house/room bonds.
  - File names are versioned (`-v3`, year-ranged) — the ETL fails loudly on 404
    when a URL rolls over.
- **Licence / attribution:** **CC BY 3.0 NZ**, attribute "The Ministry of
  Business, Innovation and Employment".
  - UI source-chip string: **"MBIE Tenancy bonds · <quarter>"**

## Auckland Council Open Data — hazard + planning layers (M14)

- **What:** seven layers from the council ArcGIS hub
  (`services1.arcgis.com/n4yPwebTjJCmXB6W`, keyless REST, maxRecordCount
  2000): Flood Plains 1% AEP, Overland Flow Paths, Coastal Inundation 1% AEP
  (base + +1 m SLR variant), Liquefaction Vulnerability (Calibrated),
  Historic Heritage Overlay, Unitary Plan Base Zone. Feed the `hazard` and
  `planning` metric dimensions. Full audit + locked decisions:
  `docs/spikes/tri-67-hazard-licence-audit.md`.
- **Licence / attribution:** **CC BY 4.0** (portal-wide user-licence page —
  hub "Custom License" labels are disclaimer text). Attribute Auckland
  Council (zoning + heritage: "Plans and Places, Auckland Council";
  liquefaction adds the UoA Uniservices report). **Rider on the AUP-family
  layers:** "no substantial republication without prior written consent" —
  our derived per-suburb statistics + simplified attributed overlays are
  within the licence; verbatim bulk redistribution is not done.
- **Cadence / vintage:** layers update continually (flood layers edited
  2026-07-31; AUP layers = "AUP July 2026"; liquefaction static 2022;
  coastal model TR2020/24). `as_of` on metric rows = each service's
  `lastEditDate` at retrieval; retrieval is part of the vintage.
- **ETL:** paged whole-layer streaming (refined from the sign-off's per-SA2
  envelope plan — measured ~22 s/SA2; recorded in the spike doc) with
  gitignored intermediates + per-layer checkpoint/resume —
  `scripts/etl/tri-68-hazard-metrics.mjs`. Fetch `f=json` + terraformer
  ONLY: this org's `f=geojson` flattens interior rings (fills every hole).
  Map overlays are a separate simplified pipeline
  (`tri-69-hazard-overlays.mjs` → `public/geo/hazards/`, ≤1 MB budget).
- **HAIL / contaminated land: NOT openly published for Auckland** —
  LIM/property-file only (verified against the council's full ArcGIS
  catalogue, 2026-08-03). The app states this gap rather than substituting.
- **Caveat (verbatim, on every hazard surface):** "Area-level model — not a
  property assessment. Check the council Flood Viewer and a LIM report for
  any specific property."

## Stats NZ Building Consents — new dwellings by SA2 (M15)

- **What:** monthly "Building consents issued" release, supplementary CSV
  "New dwellings consented by 2023 statistical area 2 (Monthly)" — new
  dwelling-unit counts per SA2 per month from 1990-04, with dwelling-type
  splits. Feeds `consents_new_dwellings_12m` (rolling 12-month sums, 24
  monthly as_of_dates, confidence `high`) and `consents_per_1000_dwellings`
  (Census-2023 denominator, confidence `medium`). Spike + locked decisions:
  `docs/spikes/tri-72-stats-consents.md`; deferred scope (type splits,
  deeper history, 2026-SA2 vintage) tracked in TRI-77.
- **Auth:** none — keyless zip under the release page's
  `/assets/Uploads/Building-consents-issued/...` path. URLs are
  **month-stamped**: bump `RELEASE` in `scripts/etl/tri-73-consents.mjs`.
- **Cadence:** monthly, ≈2-month publication lag (May data published 1 July).
  Refresh = bump `RELEASE` → re-run ETL → commit/push → `tri-73-consents.sql`.
- **Caveats:**
  - **Consents are intentions to build, not completions** — stated in metric
    descriptions, the profile embedding sentence, and the answer prompt.
  - Zeros are explicit rows (administrative counts — no suppression handling,
    unlike census tables).
  - The zip's compression defeats PowerShell `Expand-Archive`; use
    `tar` (bsdtar) — the ETL does.
  - Each zip also carries a "2026 statistical area 2" vintage file — ignored
    (our geographies are SA2 2023).
- **Licence / attribution:** **CC BY 4.0**, attribute "Stats NZ".
  - UI source-chip string: **"Building consents issued (new dwellings by
    SA2) · <year>"**

## Existing sources (for completeness)

| Source | Used for | Licence |
|---|---|---|
| Stats NZ ADE (Census 2023) | census metrics | CC BY 4.0 |
| NZDep2018 (Otago) | deprivation | CC BY (via Massey ArcGIS mirror) |
| MOE Schools Directory | schools | CC BY 4.0 |
| LINZ Basemaps | map tiles | CC BY 4.0 (key rotates ~90 days) |
| OpenStreetMap | ORS road graph | ODbL 1.0 |
