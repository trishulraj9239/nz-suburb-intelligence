# NZ Suburb Intelligence

A natural-language suburb-comparison tool over New Zealand open government data.
Ask a question, read the map, open a suburb profile, and compare suburbs side by
side — every figure carries its source and as-of date.

**Coverage:** Auckland (SA2 areas) for now. The map draws a dark border around the
exact data extent, and the dataset is region-scoped by config so other regions can
be added without code changes.

## What it does

- **Ask in plain English** — a query bar turns a question ("cheapest rent near
  Takapuna?", "compare Takapuna and Albany") into a structured query and a
  **streaming, cited answer**. Every factual claim shows an inline citation chip
  (source · year); comparison questions pre-load the Compare set.
- **Map** — MapLibre GL with a LINZ topolite basemap, the SA2 overlay, **choropleth
  shading** by any scalar metric (quantile ramp + legend), hover tooltips, and
  fly-to on selection. Light/dark tuned.
- **Suburb profile** — scorecard with percentile-vs-region bars, source chips and
  as-of dates: people, housing, deprivation, **2013→2018→2023 census trends**,
  **nearby schools by distance** (PostGIS, not just schools inside the SA2), and
  **Getting around** — typical drive / cycle / walk times to the CBD and airport,
  routed on real roads (openrouteservice/OSM), always labelled *typical · no live
  traffic*.
- **Commute questions** — "commute from Grey Lynn to 4 Osterley Way?", "suburbs
  under $650 rent within 30 min drive of Penrose?" — the ask bar geocodes NZ
  addresses locally (LINZ NZ Addresses in Postgres, pg_trgm fuzzy match) and
  routes them live, cached indefinitely. Set **your workplace** (geocode-confirmed,
  stored client-side) and profiles gain a commute-to-work row.
- **Compare** — up to three suburbs: full profiles side by side on desktop
  (dimensions aligned as rows), a compact table on mobile.
- **Rent budget** — set a weekly budget; profile/compare/answers show under / on /
  over-budget chips against median rent.
- **Mobile** — the map fills the screen and the context panel is a draggable bottom
  sheet (peek / half / full); a Home button resets the map view, selection,
  comparison, answer, and query.

## Stack

- **Next.js 16** (App Router, TypeScript) on **Vercel** · **React 19**
- **Supabase** (Postgres + PostGIS) via `@supabase/ssr` — separate browser + server clients
- **MapLibre GL** — SA2 choropleth, LINZ topolite vector basemap
- **`@anthropic-ai/sdk`** — text-to-query, cited streaming answers, RAG over suburb embeddings
- **Tailwind v4**, CSS-first design tokens (see `app/globals.css`) · **next-themes** (`[data-theme]`, defaults to light)
- Fonts via `next/font`: Space Grotesk (display), IBM Plex Sans (body), IBM Plex Mono (figures)

> **Note:** this Next.js is newer than most training data — verify APIs against the
> installed types / `node_modules/next/dist/docs/` rather than assuming.

## Architecture

![Architecture flow: a single-page Client (Next.js / React / MapLibre) reads suburb data straight from Supabase via PostgREST/RPC for the no-LLM browse path, while natural-language questions POST to the /api/ask server route, which plans a structured JSON query with Claude Sonnet, embeds the query with Gemini for pgvector RAG against Supabase, runs the queries, and streams a cited NDJSON answer back to the client.](docs/architecture.png)

Two paths share one source of truth. The **browse path** (no LLM) reads suburb
profiles and the choropleth straight from Supabase over PostgREST/RPC. The **ask
path** sends a question to `/api/ask`, which plans a structured query with **Claude
Sonnet**, embeds it with **Gemini** for pgvector RAG, executes the queries against
**Supabase**, and streams a cited answer back as NDJSON.

## Getting started

```bash
cp .env.example .env.local   # then fill in the Supabase + LINZ values
npm install
npm run dev                  # http://localhost:3000
npm run build                # production build + type-check
npm run lint                 # eslint (eslint-config-next)
```

### Environment variables

Only `NEXT_PUBLIC_`-prefixed vars are shipped to the browser. Set the same three in
Vercel → Project → Settings → Environment Variables.

| Var | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | anon key only |
| `NEXT_PUBLIC_LINZ_API_KEY` | LINZ Basemaps | scoped basemap tile key |

Server-only secrets — the Supabase **service-role key**, `ANTHROPIC_API_KEY`,
`GEMINI_API_KEY`, and `ORS_API_KEY` (openrouteservice, powers `/api/commute`) —
power the API routes and ingestion. `LINZ_LDS_API_KEY` (LINZ **Data Service** — a
different site and key than Basemaps) is ETL-only and never deployed. **Never**
give any of them a `NEXT_PUBLIC_` prefix or expose them client-side.

## Health check

`GET /health` runs `select count(*) from geographies` through the server Supabase
client and returns `{ "ok": true, "geographies": N }`.

## Database

Migrations live in [`supabase/migrations`](supabase/migrations) — each file's header
carries its decision record; read it before changing schema.

- **`0001_core_schema.sql`** — `geographies`, `sources`, `metric_definitions`,
  `metric_values`, `schools` + PostGIS, RLS with public-read policies, and the
  Tier-1 source seed.
- **`0002_embeddings.sql`** — `suburb_embeddings` with pgvector at the locked
  dimension **`gemini-embedding-001` @ 768**. Server-only (no anon read);
  re-normalize 768-dim outputs before cosine similarity.
- **`0006_commute_anchors.sql`** — commute anchors as data (CBD, airport — adding
  one is an insert, not code), `ST_PointOnSurface` routing origins per SA2 (the
  stored ArcGIS centroids sat in water for 11 peninsula suburbs), matrix staging,
  ORS/LINZ source rows.
- **`0007_addresses_commute_cache.sql`** — 726k LINZ NZ Addresses (Auckland clip,
  pg_trgm) behind a `geocode_address()` gate — no anon table read; the
  live-commute cache behind validated get/put functions.

## Commute layer — why it's built this way

Routing provider: **openrouteservice's hosted free tier** over OpenStreetMap —
not self-hosted OSRM (real ops for a demo) and not Google (cost, licensing,
and results you can't cache indefinitely). The trade-off: **no live traffic**, so
every figure in the product carries "typical drive time — no live traffic", and
the road data is ODbL — the source chip attributes
*openrouteservice · © OpenStreetMap contributors*.

The split mirrors the embed-once philosophy: **bulk is precomputed** (627 SA2
origins × anchors × 3 modes ≈ 36 matrix calls at ingestion, stored as ordinary
`metric_values` with source + as-of date), and the **only runtime routing is the
user-specific case** — a typed destination or the saved workplace — geocoded
against LINZ addresses *in Postgres* (no third-party geocoder in the request
path) and cached indefinitely, because roads change slowly and the ETL re-run is
the refresh. If ORS is down or the daily quota runs low, the API degrades to a
straight-line distance flagged `fallback: true` with its own labelling — the app
never silently pretends a crow-flies number is a drive time.

## Phase 3 — persona mode over free data (why it's built this way)

Phase 3 (M12–M15) turned the generic explorer into a **renter/buyer persona
product** without a single paid dataset. The buyer story that commercial sites
tell with CV valuations and sale prices — both licence-blocked for a public
portfolio (CoreLogic/REINZ are commercial; scraping is ToS-restricted) — is
told here with what *is* open: **MBIE tenancy bonds** (live rents, quarterly),
**Auckland Council hazard + Unitary Plan layers** (flood, coastal, liquefaction,
heritage, zoning, intensification capacity), and **Stats NZ building consents**
(development trajectory, monthly at SA2). The gap itself is stated in-product:
Tier-2/3 price data is a parked provider slot (`sources.tier`), not a fake.

Three process rules made that sustainable:

- **Licence audit before any download** — each new source got a spike with a
  hard human sign-off gate (`docs/spikes/`); one layer (HAIL contaminated land)
  turned out to be LIM-only for Auckland and was dropped, and the app says so
  rather than substituting.
- **The schema absorbed all of it with zero migrations** — every Phase-3
  dataset landed as ordinary `metric_values` rows under new
  `metric_definitions` (dimensions `hazard`/`planning`, breakdowns for
  zoning/liquefaction, monthly history for consents sparklines). Personas are
  pure config (`lib/persona.ts`): section order, transparent metric weights,
  and a default map metric — a third persona is one literal.
- **Exposure is information, never a verdict** — hazard metrics are all
  `higher_is_better = NULL`, every hazard surface carries the verbatim
  area-level caveat, and "give me a risk score" gets a deterministic refusal
  listing the individual measured layers instead.

Deviations from the original Phase-3 brief, recorded honestly: map overlays are
static files in `public/geo/` (the TRI-16 precedent — Supabase Storage stays
unused), and the brief assumed Anthropic prompt caching in `/api/ask` which was
never wired up (tracked as an optional follow-up; the plan+answer prompts are
registry-driven and small enough that it hasn't mattered at portfolio scale).

## Map coverage outline

The dark coverage border is precomputed offline by dissolving the SA2 polygons
(shared interior edges cancel, leaving the boundary):

```bash
node scripts/build-coverage-outline.mjs   # → public/geo/auckland-coverage.geojson
```

Re-run it whenever `public/geo/auckland-sa2.geojson` changes. The map fits its
default and Home-reset view to this extent.

## Hazard overlays (TRI-69)

Toggleable map overlays in `public/geo/hazards/*.geojson` are simplified copies
of the Auckland Council layers, rebuilt by:

```bash
node scripts/etl/tri-69-hazard-overlays.mjs   # per layer: flood|coastal|coastal_slr1m|liquefaction|heritage
```

They are **map furniture, not analysis inputs** — the TRI-68 hazard metrics were
computed from full-detail geometry before any simplification here. Each layer is
fetched server-generalized (`maxAllowableOffset` ≈ 18 m water layers / 5 m
heritage), then walked up a `{simplify tolerance, min polygon-part area}` ladder
until it fits a ≤1 MB budget (hard fail at 2 MB); coordinates are quantized to
4 dp (≈11 m). The tolerance each layer shipped with is printed by the script and
recorded in the Linear ticket. Tiny flood/coastal cells below the rung's
part-area floor are dropped — invisible at region zoom and the dominant size
cost. Liquefaction shows only the elevated "damage possible" class (the full
5-class breakdown is in the suburb profile); overland flow paths (1.18M
polylines) have no overlay — they surface as the density metric instead.

Files are served from `public/geo/` like the SA2 polygons (TRI-16 precedent) —
a deliberate deviation from the Phase-3 brief's "Supabase Storage" wording;
Storage is unused in this repo. Overlays load lazily on first toggle, so the
map page pays nothing until a layer is switched on.

## Project tracking

Work is tracked in Linear (`TRI-XX`); commits reference those tickets. The build
shipped through M1–M5: deployable shell → schema → backend → frontend + map (the
live non-AI suburb-comparison app, "Piece 2") → the intelligence layer ("Piece 3").
</content>
