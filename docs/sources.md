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
## LINZ NZ Suburbs and Localities — suburb names + aliases (TRI-121)

- **What:** LINZ layer 113764, Auckland TA, `type IN (Suburb, Locality)` →
  `suburbs` (names, aliases from `additional_name`, LINZ population
  estimate, label point) and `suburb_sa2` (intersection shares with our SA2
  polygons, kept at ≥ 20 % either way). Resolution via `resolve_suburb()`.
  It is a **name layer only** — no metric ever attaches to a suburb row;
  a multi-SA2 suburb resolves to a list and answers cite each area.
  Spike: `docs/spikes/tri-121-linz-suburbs.md`.
- **Auth:** `LINZ_LDS_API_KEY` (ETL only). **Cadence:** LINZ republishes
  ~weekly; suburb boundaries change rarely — re-run the ETL when LINZ
  announces changes (loaded 2026-09-27). Layer has a PK, so changesets
  apply if it ever matters.
- **Licence / attribution:** **CC BY 4.0**, attribute Toitū Te Whenua LINZ.
  - UI: label layer + search-box hits carry the existing LINZ attribution.
## Stats NZ estimated resident population grid (250 m) — post-census population (TRI-120)

- **What:** "New Zealand Estimated Resident Population Grid 250 metre"
  (datafinder layer 119709, published 2026-06-25): `PopEst2022..2025` at
  30 June per 250 m cell, derived from SA1 estimates. Feeds
  `population_estimate` (four annual vintages) and
  `population_growth_2y_pct` (2023→2025). Spike + method:
  `docs/spikes/tri-120-erp-grid.md`.
- **Auth:** none — read from Stats NZ Geospatial's ArcGIS mirror
  `NZGrid_250m_ERP` (FeatureServer layer 1) because `STATS_NZ_API_KEY` has
  no datafinder WFS scope.
- **Method:** area-weighted apportionment of each cell over the SA2 polygons
  it overlaps (uniform density within a cell). Sanity check printed by the
  ETL: ERP 2023 total vs Census 2023 for the same SA2s (ERP sits a few %
  above census by design: undercount correction + residents temporarily
  overseas).
- **Cadence:** annual (Stats NZ republishes the grids with each subnational
  estimate release, ~Oct); re-run and extend `YEARS`.
- **Caveats:** Stats NZ: *"not official statistics"* — a customised
  dataset; 2024/2025 provisional. Confidence `medium` on every row; the
  census `population` series is never mixed with it.
- **Licence / attribution:** **CC BY 4.0**, attribute "Stats NZ".
  - UI source-chip string: **"Estimated resident population grid (250 m) · <year>"**
## LINZ Building Outlines + Property Boundaries — built form (TRI-119)

- **What:** layer 101290 NZ Building Outlines (roof outlines ≥ 10 m² from
  aerial imagery) and layer 122657 NZ Property Boundaries (rating units /
  titles / parcels with LINZ's `area`), streamed for the Auckland box and
  assigned to SA2s by building centre / property point-on-surface. Feed
  `building_footprint_pct`, `buildings_per_ha` (confidence `medium`,
  imagery-derived) and `median_property_m2` (`high`, exact published
  areas; all property types). Spike: `docs/spikes/tri-119-built-form.md`.
- **Auth:** `LINZ_LDS_API_KEY` (ETL only). Volumes: ~770k outlines, ~725k
  properties → paged WFS with a JSONL checkpoint in gitignored
  `tmp/built-form/` (reduced to `{sa2, area}` at fetch time); the ETL
  resumes after a kill and `--aggregate` re-runs the maths from the cache.
- **Cadence:** outlines republished ~yearly (last 2026-05-18); properties
  weekly. Re-run when LINZ republishes outlines. Land area denominator is
  Stats NZ `LAND_AREA_SQ_KM`.
- **Caveats:** footprint is a roof outline, not floor area, and includes
  garages/sheds; the median property size has **no residential filter**
  (Auckland is not in LINZ's open DVR, so there is no open property-category
  field) — the description says "all property types". SA2s with < 20 rating
  units carry no median.
- **Licence / attribution:** **CC BY 4.0**, attribute Toitū Te Whenua LINZ.
  - UI source-chip strings: **"NZ Building Outlines · 2026"**, **"NZ Property Boundaries · 2026"**

## Address-level lookups read live (TRI-123, TRI-126) — nothing ingested

- **Council hazard layers at a point** (`lib/point-hazards.ts`): one point
  query per Auckland Council ArcGIS service (flood plain 1% AEP, overland
  flow within 20 m, coastal inundation now/+1 m, liquefaction class), keyless,
  CC BY 4.0, memory-cached by rounded coordinate for an hour. A failed
  service reports "unavailable — not checked", never "outside".
- **Extended hazard layers at a point** (TRI-129, same helper): `Flood_Prone_Areas`
  (`Depth100y`, `RecordStatus`; edited 2026-09-25), `Flood_Sensitive_Areas`
  (2024), `Shallow_Landslide_Susceptibility` (4.87M polygons, sampled at the
  point by the service — never loaded; classes Very Low … Very High; 2025),
  `Large_Scale_Landslide_Susceptibility` (+ `Confidence`; 2025),
  `Susceptible_Areas_ASCIE_2050/2080/2130_RCP85_Regional` (POLYLINES — the
  mapped landward limit of the susceptible area, so reported as "within
  20 m of the line", not inside/outside; 2024), `Tsunami_Evacuation_Zones`
  (`ZONETYPE` Yellow/Orange/Red; 2024). `CoastalInstabilityAndErosion`
  (2021) is the superseded predecessor of the ASCIE series and is not
  queried. Vintage per row = the service's `lastEditDate` from its metadata
  (cached a day). Landslide wording is susceptibility, never "risk".
  **Two phases:** the shallow-landslide service answers in ~20 s however it
  is asked (point, envelope, projected — all measured 2026-09-28), so
  `/api/point-hazards?mode=fast` returns the twelve quick layers with that
  row `pending`, `?mode=slow` returns it alone (28 s timeout, route
  `maxDuration` 60), and the panel merges the two. `/api/ask` waits for the
  slow layer only when the question is about landslides. Results cache per
  layer, so the phases never repeat a council query.
- **This block — Census 2023 + NZDep2023 at SA1** (`lib/block-stats.ts`,
  TRI-130): the Stats NZ AGOL mirror's `2023_Census_totals_by_topic_for_
  {individuals,households,dwellings}_by_SA1` layers (SA1 polygons joined to
  the topic tables; field codes are `VAR_n_m` — the aliases identify them;
  codes used are listed in the helper and were verified 2026-09-28) plus the
  Healthspace NZDep2023 service's SA1 layer (id 0). Four point queries,
  cached an hour, nothing loaded (no `sa1_code` on addresses, no SA1 rows in
  the registry). Stats NZ sentinels (`-999`, `-997`, `-998`) → null and
  listed in `suppressed` → "not published for this block". Shares use each
  topic's own "Total stated". Suburb column = the app's SA2 registry values
  passed in by the profile panel, so the two scales sit side by side.
- **LINZ title & land at a point** (`lib/property-facts.ts`): NZ Property
  Boundaries (122657) by `INTERSECTS(geom, SRID=4326;POINT(lng lat))` — note
  the `SRID=4326;` prefix; a bare `POINT(lng lat)` is read lat-first and
  matches nothing — then the **no-ownership** NZ Property Titles layer
  (50804) by `title_no IN (…)`. Key `LINZ_LDS_API_KEY` server-side; ~50–300 ms
  per call; cached an hour. Owner names live in a restricted dataset and are
  never requested. Decision: live lookup instead of loading ~725k Auckland
  properties into the 500 MB Supabase tier.
- **LINZ built form on the unit** (`lib/built-form-point.ts`, TRI-127): the
  rating-unit polygon from Property Boundaries, then NZ Building Outlines
  (101290 — geometry column is `shape`, not `geom`) by
  `INTERSECTS(shape, SRID=4326;<unit WKT>)`. Count = outlines whose
  point-on-surface is inside the unit; footprint = Σ area(outline ∩ unit)
  via turf; coverage = footprint / LINZ unit area. Outline capture years
  reported. Roof outlines ≥ 10 m² from aerial imagery — not floor area, not a
  consent record; no height (LiDAR spike later). The panel's aerial
  thumbnail is four z18 tiles from the LINZ basemap (public key, CC BY 4.0,
  nothing proxied); the caption names the aerial layer at that point from the
  basemap attribution feed (`/v1/attribution/aerial/WebMercatorQuad/summary.json`,
  cached a day), e.g. "Auckland 0.075m Urban Aerial Photos (2024-2025)".
- **Unitary Plan overlays at a point** (`lib/point-overlays.ts`, TRI-128):
  ten operative overlay services on the council hub
  (`Special_Character_Areas_Overlay_Residential_and_Business`,
  `Historic_Heritage_Overlay_Extent_of_Place` / `_Place`, `Notable_Trees_Overlay`
  / `Notable_Group_of_Trees_Overlay`, `Aircraft_Noise_Overlay`,
  `City_Centre_Port_Noise_Overlay`, the two volcanic viewshaft overlays,
  `Waitakere_Ranges_Heritage_Area_Overlay`), keyless, `f=json`. Polygons:
  one 5 m query, then an exact-point query only on a hit (inside / on or
  near the boundary / outside); points: 30 m. Attribute codes (TYPE,
  SUBTYPE, VERSIONSTATUS) are decoded from each layer's coded-value domains
  fetched from its metadata (cached a day) — `TYPE 18` renders as "Business
  Ponsonby Road". `outFields=*` because not every service has
  `DocumentURL`. Non-operative version statuses are shown as such. Proposed
  plan-change layers are never queried. Licence rider (TRI-67): derived
  facts per point, never a bulk republication.
- **Licence / attribution:** council layers CC BY 4.0 (Auckland Council);
  LINZ layers CC BY 4.0 (Toitū Te Whenua LINZ). Point results are public
  records / area-level models, never a valuation or inspection — the copy
  says so on every surface.

## Deliberately not ingested (address level) — TRI-132

Facts buyers ask for that exist behind a search box but are **not openly
licensed** (or are restricted by law). The app links out with a one-line
reason (`lib/link-outs.ts`, rendered as "Also check — not held by this app")
and `/api/ask` answers questions about them deterministically with the
source, never a guess. Nothing below is fetched, cached or proxied. Re-audit
before changing any of these; if a source opens up, it becomes an ingest
ticket, not a fetch from the panel.

| Fact | Where it is | Why not ingested (verified 2026-09-27) |
|---|---|---|
| Capital value, land value, rates | Auckland Council rates & valuation search | Council has not opted into LINZ's open District Valuation Roll (table 114085 covers other TAs only). The council ArcGIS service `AGOL_RateAccountInfo1_gdb` is queryable but its companion item's licence reads "Do not supply: Valuations staff use only". Reachable ≠ licensed. |
| Sales history, price estimates | homes.co.nz / OneRoof / TradeMe | No open source; listing-site estimates are proprietary models. Suburb-level prices are TRI-38. |
| Natural hazard insurance claims | Natural Hazards Portal map | Settled EQCover claims since 1997 by address, UI-only under the portal's Terms of Use; no open data or API. |
| Fibre / broadband availability | broadbandmap.nz | Data and API by arrangement, not open. |
| LIM report | Auckland Council order-a-LIM page | Authoritative per-property record for hazards, consents, HAIL; not open data. |
| Per-property building consents | Auckland Council property file (paid) | Stats NZ consents are SA2-level (TRI-73); per-address history is in the paid file. |
| Owners, memorials, full title | LINZ search & order a land record | Owner names are restricted by law; memorials are on the ordered title (feasibility spike TRI-134). |

Address prefill: every target tested 2026-09-28; none accepts the address in
its URL, so the panel offers a copy-address button rather than a deep link
that silently drops the address.

## Existing sources (for completeness)

| Source | Used for | Licence |
|---|---|---|
| Stats NZ ADE (Census 2023) | census metrics | CC BY 4.0 |
| NZDep2018 (Otago) | deprivation, earlier vintage (delta only) | CC BY (via Massey ArcGIS mirror) |
| MOE Schools Directory | schools | CC BY 4.0 |
| LINZ Basemaps | map tiles | CC BY 4.0 (key rotates ~90 days) |
| OpenStreetMap | ORS road graph | ODbL 1.0 |
