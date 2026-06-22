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
  **nearby schools by distance** (PostGIS, not just schools inside the SA2), and a
  **straight-line CBD commute** estimate.
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
| `NEXT_PUBLIC_LINZ_API_KEY` | LINZ Data Service | scoped basemap tile key |

Server-only secrets — the Supabase **service-role key**, `ANTHROPIC_API_KEY`, and
`GEMINI_API_KEY` — power the `/api/ask` route and ingestion. **Never** give any of
them a `NEXT_PUBLIC_` prefix or expose them client-side.

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

## Map coverage outline

The dark coverage border is precomputed offline by dissolving the SA2 polygons
(shared interior edges cancel, leaving the boundary):

```bash
node scripts/build-coverage-outline.mjs   # → public/geo/auckland-coverage.geojson
```

Re-run it whenever `public/geo/auckland-sa2.geojson` changes. The map fits its
default and Home-reset view to this extent.

## Project tracking

Work is tracked in Linear (`TRI-XX`); commits reference those tickets. The build
shipped through M1–M5: deployable shell → schema → backend → frontend + map (the
live non-AI suburb-comparison app, "Piece 2") → the intelligence layer ("Piece 3").
</content>
