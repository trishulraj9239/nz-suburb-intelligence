@AGENTS.md

# CLAUDE.md — NZ Suburb Intelligence

Natural-language suburb-comparison tool over New Zealand open government data.
(The `@AGENTS.md` import above carries the **non-standard Next.js** warning — heed it: read the
relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.)

## Commands
```bash
cp .env.example .env.local   # fill in Supabase values first
npm install
npm run dev      # http://localhost:3000
npm run build    # production build + type-check
npm run lint     # eslint (eslint-config-next)
```
**Health check:** `GET /health` runs `select count(*) from geographies` via the server Supabase
client → `{ "ok": true, "geographies": N }`.fixed 

## Stack & architecture
- **Next.js 16.2.9 + React 19.2.4** (App Router, TypeScript) on **Vercel**. Newer than most training
  data — verify APIs against installed types/docs, don't assume.
- **Supabase** (Postgres + PostGIS) via `@supabase/ssr` — separate **browser** and **server** clients.
- **MapLibre GL** — SA2 choropleth map, LINZ topolite vector basemap, hover tooltips, fly-to.
- **Intelligence layer** — `@anthropic-ai/sdk`: text-to-query, cited answers, RAG over suburb embeddings.
- **Tailwind v4, CSS-first** — tokens in `app/globals.css` (`@theme inline`); no `tailwind.config.js`.
  `next-themes` for light/dark (`[data-theme]`). Fonts: Space Grotesk / IBM Plex Sans / IBM Plex Mono.
- Key dirs: `app/` (routes), `components/`, `lib/`, `data/`, `scripts/`, `supabase/migrations/`, `docs/`.

## Environment variables (security-critical)
- Only `NEXT_PUBLIC_`-prefixed vars reach the browser. The three public ones:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key only), `NEXT_PUBLIC_LINZ_API_KEY`.
- **NEVER** add server-only secrets (Supabase service-role key, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`)
  with a `NEXT_PUBLIC_` prefix, and never expose them client-side.

## Database
Migrations in `supabase/migrations/`:
- `0001_core_schema.sql` — `geographies`, `sources`, `metric_definitions`, `metric_values`, `schools`
  + PostGIS, RLS with public-read policies, Tier-1 source seed.
- `0002_embeddings.sql` — `suburb_embeddings` with pgvector at the **locked** dimension
  `gemini-embedding-001 @ 768` (server-only, no anon read; re-normalize 768-dim outputs before cosine).
Decision records live in each migration's header — read before changing schema.

## Git / workflow
`main`, remote `origin` → `trishulraj9239/nz-suburb-intelligence`. Commits reference **Linear tickets**
(`TRI-XX`) — keep that convention. Branch before non-trivial work; let me write commit messages.
Note `.env.local` is gitignored — never commit secrets.
