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

- **What:** authoritative NZ address points (LINZ Data Service layer 105689
  "NZ Addresses"), clipped to Auckland region → `addresses` table for
  pg_trgm fuzzy geocoding. No third-party geocode API in the request path.
- **Cadence:** LINZ updates the layer roughly weekly; our table is a one-off
  load, refreshed manually if stale addresses become a problem.
- **Licence / attribution:** **CC BY 4.0**.
  - UI source-chip string: **"Addresses: Toitū Te Whenua LINZ (CC BY 4.0)"**

## Existing sources (for completeness)

| Source | Used for | Licence |
|---|---|---|
| Stats NZ ADE (Census 2023) | census metrics | CC BY 4.0 |
| NZDep2018 (Otago) | deprivation | CC BY (via Massey ArcGIS mirror) |
| MOE Schools Directory | schools | CC BY 4.0 |
| LINZ Basemaps | map tiles | CC BY 4.0 (key rotates ~90 days) |
| OpenStreetMap | ORS road graph | ODbL 1.0 |
