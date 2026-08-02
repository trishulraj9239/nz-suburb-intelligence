# Spike: Hazard + zoning layer licence & vintage audit (TRI-67)

**Date:** 2026-08-03 · **Status: AUDIT COMPLETE — AWAITING SIGN-OFF. Hard
gate: nothing downloads before human sign-off on this document.**
**Headline: 7 of 8 audited layers are open (CC BY 4.0 + attribution); HAIL is
not openly published for Auckland and is dropped.**

Scope (Phase 3 plan, M14): flood plains 1% AEP, flood prone areas, overland
flow paths, coastal inundation 1% AEP, liquefaction, HAIL/contaminated sites,
historic heritage overlay, AUP base zones. Verdict per layer below; non-open
layers are dropped with a README note, never worked around.

## Layer audit table

All open layers live on Auckland Council's ArcGIS org
(`services1.arcgis.com/n4yPwebTjJCmXB6W`), REST-queryable with `f=geojson`
(maxRecordCount 2000, page with `resultOffset`) — same keyless FeatureServer
pattern as the TRI-18 NZDep load. Retrieval date must be recorded per layer
(licence text notes datasets update continually).

| Layer | Dataset (hub) | Licence + attribution | Vintage | Geometry / count | Verdict |
|---|---|---|---|---|---|
| AUP zoning | Unitary Plan Base Zone | CC BY 4.0 · "Plans and Places, Auckland Council" (rider — see below) | AUP July 2026; svc edit 2026-07-31 | polygon / **139,436** (~335 MB full) | **OPEN-OK** (rider flagged) |
| Heritage | Historic Heritage Overlay Extent of Place | same as above | AUP July 2026; 2026-07-31 | polygon / 1,961 (~2 MB) | **OPEN-OK** (rider flagged) |
| Liquefaction | Liquefaction Vulnerability **Calibrated** Assessment (Basic exists as fallback) | CC BY 4.0 · Auckland Council + "'Liquefaction Vulnerability Maps for the Auckland Region', Altaf/Wotherspoon/Orense, UoA Uniservices V0.2" | static study, data edit 2022-08-17 | polygon / 1,172, **5 classes** (`VulnerabilityDescription`) | **OPEN-OK** |
| HAIL / contaminated land | — none exists for Auckland | LIM/property-file only (contaminatedsites@ email); zero matching services in the council's 570-service AGOL catalogue; open HAIL registers exist for other regions (HBRC, Southland…) but not Auckland | — | — | **NOT-AVAILABLE → DROP** with README note; never substituted |
| Flood plains 1% AEP | Flood Plains | CC BY 4.0 (portal-wide terms; hub label "Custom" is a disclaimer) · Auckland Council (Healthy Waters) | model: 1% AEP, MPD + climate change, continually updated; data edit 2026-07-31 | polygon / 12,630 (~594 MB) | **OPEN-OK** |
| Flood prone areas | Flood Prone Areas | same | TP108 (1999) ponding; data edit 2026-07-31 | polygon / 35,338 (~309 MB) | **OPEN-OK — but propose OUT of v1 scope** (not in the plan's 7; easy later add) |
| Overland flow paths | Overland Flow Paths | same | WSP 2019 re-map from 2016/17 LiDAR (1 m DEM); data edit 2026-03-24, ad-hoc updates | **polyline / 1,176,253** (~1.71 GB) | **OPEN-OK** (compute-risk layer — see ETL notes) |
| Coastal inundation 1% AEP | Coastal Inundation 1% AEP | same | storm-tide + wave setup 2013–2019, TR2020/24 (Carpenter/Roberts/Klinac 2020); item 2025-05-30; excludes wave runup + rainfall flooding | polygon / 689, very dense (~1.27 GB stated) | **OPEN-OK** (base layer only; 0.5/1/1.5/2 m SLR variants exist, out of v1 scope) |

**Licence rider (both AUP-July-2026 layers, verbatim from the ArcGIS item
`licenseInfo`):** the council's standard statement grants CC BY 4.0 but adds
*"You are not permitted to copy or republish any substantial amount of the
information from this website without the prior written consent of Auckland
Council"* and *"Information from this web site may not be used for the purposes
of any legal disputes."* The hub labels the datasets CC BY 4.0; our use is
derived per-suburb statistics + simplified overlays with attribution, not
verbatim bulk republication — assessed as within the licence, **flag for
human confirmation at sign-off**. The no-legal-disputes line reinforces the
existing area-level caveat posture.

**Zone-bucket mapping (from the audited `ZONE` coded-value domain, 72 codes;
`GROUPZONE` = coarse fallback):** Single House = code 19; Mixed Housing
Suburban = 18; Mixed Housing Urban = 60; THAB = 8 ("Terrace Housing and
Apartment Building" — singular Building); Business = 10 `Business - *` zones;
Rural+Open = 7 `Rural - *` + 5 `Open Space - *` zones. Leftovers (Large Lot,
Rural & Coastal Settlement, Coastal, Special Purpose, Future Urban) → an
"Other" bucket rather than force-fitting. NOTE: the `NAME` field is place
names, NOT zone type — bucket on `ZONE`.

**Liquefaction classes (calibrated layer):** Damage is Possible ·
Damage is Unlikely · Very Low Vulnerability · Low Vulnerability · Category
Undetermined — `liquefaction_share` breakdown uses these five verbatim.
Dataset self-describes as neighbourhood-scale desktop assessment — aligns
with our verbatim caveat.

**Special Character Areas Overlay** exists as a separate layer (153 polygons,
same licence family) — noted for a possible M15+ addition, not in M14 scope.

**Water-layer disclaimers (constraint text, carried into UI copy):** catchment-
level modelling, "does not preclude the need for appropriate site-specific
assessment", no warranty, data continually updated (record retrieval date per
layer). This is precisely the verbatim caveat's job.

## ETL feasibility notes (sizes change the TRI-68 plan)

The brief's mental model was "download each layer, intersect locally". The
audited sizes (0.6–1.7 GB for three of the layers) make monolithic downloads
wasteful and turf-on-whole-file memory-risky. Proposed pattern instead —
**per-SA2 envelope-filtered REST fetches**:

- For each residential SA2, query the layer's FeatureServer with
  `geometry=<SA2 bbox>&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&f=geojson`
  (+ `geometryPrecision` to trim coordinate noise), cache the response to
  `data/hazards/raw/<layer>/<sa2>.json` (gitignored), then turf-intersect
  against the SA2 polygon. Checkpoint/resume per SA2 (tri-44 precedent).
- Overland flow (1.18 M polylines) is the compute-risk layer: envelope
  filtering keeps each SA2's slice tractable; the density metric (recommended
  below) only needs clipped lengths, no buffering.
- Coastal inundation's 689 mega-polygons will dominate single-feature size —
  `maxAllowableOffset` is available for the *overlay* exports (TRI-69), but
  metric computation uses full-resolution geometry.
- Overlay simplification budgets (TRI-69) unchanged: ≤1 MB target per layer,
  fail >2 MB. For flood plains + overland flow the overlay may need stronger
  simplification or zoom-dependent tiling — tolerance decisions recorded in
  README when made.

## Checkpoint decisions requested (sign-off gate)

1. **Licence reading accepted?** All 7 surviving layers CC BY 4.0 with
   attribution (portal-wide terms; "Custom" hub labels are disclaimers).
   Specifically confirm the AUP-layer rider ("no substantial republication
   without written consent") is acceptable for derived per-suburb stats +
   simplified overlays with attribution.
2. **HAIL dropped** (no open Auckland dataset exists — LIM-only): cut
   `hail_site_count`, README note "not openly available", never substituted?
3. **Overland-flow metric = density (km/km²)** rather than an invented 10 m
   buffer — accept recommendation?
4. **Liquefaction layer = Calibrated** (5-class) with Basic as fallback?
5. **Scope confirmations:** Flood Prone Areas out of v1; coastal inundation
   base layer only (no SLR variants) for v1?
6. **ETL pattern = per-SA2 envelope-filtered fetches** with gitignored raw
   cache (instead of monolithic downloads) — accept?

## Proposed metric definitions (insert at TRI-68, not now)

All hazards `higher_is_better = NULL` (hazard exposure is information, never a
verdict), `confidence: derived` posture is per-metric below; source = the
layer's own source row; `as_of` = the layer's published vintage date. Computed
per **residential** SA2 (the M3 residential filter) with local turf.js
(bbox-prefilter → intersect → geodesic area).

| key | definition | type | unit |
|---|---|---|---|
| `flood_plain_pct` | % of SA2 land area inside the 1% AEP flood plain | scalar | % |
| `overland_flow_pct` *or* `overland_flow_density` | see decision below | scalar | % or km/km² |
| `coastal_inundation_pct` | % of SA2 land area inside coastal inundation 1% AEP (present-day, no SLR offset) | scalar | % |
| `liquefaction_share` | share of SA2 land area by susceptibility class | **breakdown** | % per class |
| ~~`hail_site_count`~~ | **CUT** — no open Auckland HAIL dataset exists (LIM-only); README notes the gap | — | — |
| `heritage_overlay_pct` | % of SA2 land area inside the Historic Heritage Overlay | scalar | % |
| `zoning_share` | share of SA2 land area by zone bucket (Single House / MHS / MHU / THAB / Business / Rural+Open) | **breakdown** | % per bucket |
| `intensification_capacity_indicator` | MHU + THAB share of residential-zoned land | scalar | % |

- Confidence: `derived` semantics already exist in the UI (client-computed
  chip); for stored rows propose `medium` with descriptions stating "derived
  from intersection of council layers" — matches the NZDep/commute precedent
  of medium = mapped/derived. (Final call at sign-off.)
- Every hazard surface (profile section, Compare, overlay legend, NL answers)
  carries the verbatim caveat:
  > "Area-level model — not a property assessment. Check the council Flood
  > Viewer and a LIM report for any specific property."

## Decision needed: overland-flow metric definition

Overland flow paths are (mostly) LINE geometry — "% of area" needs a
convention. Options for sign-off:

1. **10 m-buffer area-pct** — buffer paths by 10 m, intersect, report % of SA2
   area. Pro: same unit as the other hazard metrics, intuitive "how much of
   the suburb is near a flow path". Con: the 10 m buffer is our invention
   (must be documented as such); doubles geometry work.
2. **Density km/km²** — total path length in the SA2 ÷ SA2 area. Pro: no
   invented buffer, cheap to compute. Con: unit is unlike the sibling
   metrics; harder to explain in UI copy.

Recommendation: **option 2 (density)** — it adds no modelling assumption of
ours to someone else's model, which fits the project's honesty posture. UI
label: "Overland flow path density".

## Simplification tolerances (overlays, TRI-69)

Targets per the plan: `public/geo/hazards/*.geojson` ≤ 1 MB each, build fails
at > 2 MB. Proposed starting tolerances (topology-preserving simplify,
recorded in README; raised per layer only if the size gate fails):

- Flood plains / coastal inundation / heritage / zoning polygons: 5 m
- Overland flow lines: 10 m (lines compress well; may ship un-simplified)
- Liquefaction: 10 m (broad soil polygons tolerate more)

## Verification plan (TRI-68 known-answer checks)

1. A 2023-flood-affected suburb (e.g. one of the Auckland Anniversary flood
   hotspots — Rānui/Henderson or Māngere) shows materially non-zero
   `flood_plain_pct`.
2. A heritage-heavy inner suburb (Ponsonby/Herne Bay cluster) shows high
   `heritage_overlay_pct`.
3. A THAB-zoned corridor suburb shows `intensification_capacity_indicator`
   well above a Single-House-zoned suburb (e.g. compare a rail-corridor suburb
   vs Remuera/Epsom character areas).
4. `zoning_share` buckets sum to ≈100% of zoned land per SA2.
5. Coastal inundation ≈ 0 for inland suburbs (e.g. Titirangi East), non-zero
   for low-lying coastal SA2s.

## Staged source rows (insert at TRI-68 after sign-off — NOT executed)

```sql
insert into sources (source_key, name, publisher, url, licence, tier) values
  ('ac_flood_plains', 'Flood Plains (1% AEP)',
   'Auckland Council (Healthy Waters)',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::flood-plains/about',
   'CC BY 4.0; attribution: Auckland Council', 1),
  ('ac_overland_flow', 'Overland Flow Paths',
   'Auckland Council (Healthy Waters)',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::overland-flow-paths/about',
   'CC BY 4.0; attribution: Auckland Council', 1),
  ('ac_coastal_inundation', 'Coastal Inundation 1% AEP',
   'Auckland Council',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::coastal-inundation-1-aep/about',
   'CC BY 4.0; attribution: Auckland Council (TR2020/24)', 1),
  ('ac_liquefaction', 'Liquefaction Vulnerability Calibrated Assessment',
   'Auckland Council / University of Auckland Uniservices',
   'https://data-aucklandcouncil.opendata.arcgis.com/maps/liquefaction-vulnerability-calibrated-assessment-1',
   'CC BY 4.0; attribution: Auckland Council + "Liquefaction Vulnerability Maps for the Auckland Region", Altaf/Wotherspoon/Orense, UoA Uniservices', 1),
  ('ac_heritage_overlay', 'Historic Heritage Overlay Extent of Place',
   'Auckland Council (Plans and Places)',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::historic-heritage-overlay-extent-of-place/about',
   'CC BY 4.0; attribution: Plans and Places, Auckland Council', 1),
  ('ac_unitary_plan_zones', 'Unitary Plan Base Zone (AUP July 2026)',
   'Auckland Council (Plans and Places)',
   'https://data-aucklandcouncil.opendata.arcgis.com/datasets/aucklandcouncil::unitary-plan-base-zone/about',
   'CC BY 4.0; attribution: Plans and Places, Auckland Council', 1)
on conflict (source_key) do nothing;
```

`docs/sources.md` gains one section covering the Auckland Council hub family
(shared REST pattern, retrieval-date rule, the licence-rider note, the HAIL
gap) at TRI-68.
