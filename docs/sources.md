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
- **Cadence:** LINZ updates the layer roughly weekly. The table was a one-off
  full load (TRI-44, 2026-07-31); since TRI-138 it is refreshed
  **incrementally via LDS WFS changesets** — `layer-123113-changeset` with
  `viewparams=from:<iso>;to:<iso>` returns the net diff (one row per
  `address_id`, `__change__` = INSERT/UPDATE/DELETE). Refresh = run
  `scripts/etl/tri-138-address-changeset.mjs` (reads/advances
  `data/addresses/tri138-state.json`) → commit + push → run
  `scripts/etl/tri-138-address-changeset.sql`. Rows that land outside the
  633 SA2s are treated as deletes (same clip rule as the full load). Load
  log: full 2026-07-31; changeset 2026-07-31→2026-09-27 (TRI-138).
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
- **Cadence:** monthly, ≈2-month publication lag (May data published 1 July;
  July data published 28 Aug). Refresh = bump `RELEASE` → re-run ETL →
  commit/push → `tri-73-consents.sql`. Loaded releases: May 2026 (TRI-73,
  2026-08-04), **July 2026 (TRI-137, 2026-09-27)** — each load upserts 24
  month-ends, so the history in the DB accumulates (26 dates after July).
  - The zip is bzip2-compressed: only Windows' bundled bsdtar extracts it
    (the ETL pins `C:\Windows\System32\tar.exe`; git-bash GNU tar fails).
  - Cache is keyed by release (`tmp/consents/<release>/`) — a stale CSV
    once silently re-emitted the old months.
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

## NZDep2023 — deprivation (current vintage, TRI-117)

- **What:** University of Otago HIRP *NZDep2023 Index of Socioeconomic
  Deprivation* (Atkinson, Salmond, Crampton, Viggers, Lacey; 31 Oct 2024),
  SA2 population-weighted averages. Built on **SA2-2023 codes** → direct join,
  confidence `high` on every row. Feeds `nzdep_decile` / `nzdep_score` as the
  latest vintage (`as_of` 2023-03-07); the NZDep2018 rows are kept so the
  profile shows a 2018→2023 delta. Spike: `docs/spikes/tri-117-nzdep2023.md`.
- **Auth:** none. The ETL reads the Massey/EHINZ "Healthspace" ArcGIS feature
  service that powers the official webmap (the same channel as NZDep2018);
  **otago.ac.nz itself sits behind a Cloudflare challenge** that blocks
  `curl`/fetch — open the source files in a normal browser if you need them.
- **Cadence:** none (next index follows the 2028 census). Coverage 618/633
  Auckland SA2s; 9 present with no value, 6 oceanic/inlet SA2s absent —
  those keep their 2018 row (chip already says medium/low) or show nothing.
- **Caveats:** deciles are ranks across all NZ areas (10% are always decile
  10), so a change between vintages is relative, never "got better/worse";
  `higher_is_better` stays NULL.
- **Licence / attribution:** **CC BY 4.0** per the User's Manual (read via a
  search-engine copy on 2026-09-27; the manual itself was unreachable by
  automation — re-check by hand when convenient). Attribute *"University of
  Otago (Atkinson et al. 2024)"*.
  - UI source-chip string: **"NZDep2023 · 2023"**
## Stats NZ Census 2023 dwellings — housing quality (TRI-118)

- **What:** "2023 Census totals by topic for dwellings by SA2" (dampness,
  mould, heating types, bedrooms) and "2023 Census change in occupied and
  unoccupied private dwellings by SA2" (total dwellings + land area). Feed
  `dwelling_damp_pct`, `dwelling_mould_pct`, `avg_bedrooms`, `bedrooms`,
  `heat_pump_pct`, `no_heating_pct`, `dwelling_density_per_km2`. Spike +
  column mapping: `docs/spikes/tri-118-census-housing-quality.md`.
- **Auth:** none. Read from Stats NZ Geospatial's ArcGIS Online services
  (`services2.arcgis.com/vKb0s8tBIA3bdocZ`), which mirror datafinder layers
  120853 / 119481 under the same licence. **Our `STATS_NZ_API_KEY` is an ADE
  key and cannot read datafinder WFS** ("Feature type unknown"); the
  datafinder lookup-table attachments (VAR code dictionary) are keyless.
- **Cadence:** none until the next census. Coverage 627/633 Auckland SA2s;
  9 fully confidentialised SA2s (industrial/hospital/harbour) carry no rows.
- **Caveats:** suppressed cells are `-999` in the source → absent rows, never
  zeros; counts random-rounded base 3, so % metrics need ≥ 30 stated
  dwellings; heating is multi-response → single-type shares only; density =
  published total dwellings ÷ Stats NZ `LAND_AREA_SQ_KM`.
- **Licence / attribution:** **CC BY 4.0**, attribute "Stats NZ".
  - UI source-chip string: **"Census 2023 dwellings · <year>"**

## Existing sources (for completeness)

| Source | Used for | Licence |
|---|---|---|
| Stats NZ ADE (Census 2023) | census metrics | CC BY 4.0 |
| NZDep2018 (Otago) | deprivation, earlier vintage (delta only) | CC BY (via Massey ArcGIS mirror) |
| MOE Schools Directory | schools | CC BY 4.0 |
| LINZ Basemaps | map tiles | CC BY 4.0 (key rotates ~90 days) |
| OpenStreetMap | ORS road graph | ODbL 1.0 |
