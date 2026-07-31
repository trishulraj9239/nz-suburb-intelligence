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

## Existing sources (for completeness)

| Source | Used for | Licence |
|---|---|---|
| Stats NZ ADE (Census 2023) | census metrics | CC BY 4.0 |
| NZDep2018 (Otago) | deprivation | CC BY (via Massey ArcGIS mirror) |
| MOE Schools Directory | schools | CC BY 4.0 |
| LINZ Basemaps | map tiles | CC BY 4.0 (key rotates ~90 days) |
| OpenStreetMap | ORS road graph | ODbL 1.0 |
