# NZ Suburb Intelligence

A natural-language suburb-comparison tool over New Zealand open government data.

This repo is at **M1 — the deployable shell**: it builds, deploys, themes, and
connects to Supabase. Data views, the SA2 map overlay, and any LLM feature are
later milestones.

## Stack

- **Next.js** (App Router, TypeScript) on **Vercel**
- **Supabase** (Postgres + PostGIS) via `@supabase/ssr` — browser + server clients
- **MapLibre GL** — empty map container this milestone (no tiles yet)
- **Tailwind v4**, driven entirely by CSS-variable design tokens (see `app/globals.css`)
- **next-themes** for the light/dark toggle (`[data-theme]`, respects OS preference)
- Fonts via `next/font`: Space Grotesk (display), IBM Plex Sans (body), IBM Plex Mono (figures)

## Getting started

```bash
cp .env.example .env.local   # then fill in the Supabase values
npm install
npm run dev                  # http://localhost:3000
```

### Environment variables

Only `NEXT_PUBLIC_`-prefixed vars are shipped to the browser. Set the same three
in Vercel → Project → Settings → Environment Variables.

| Var | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | anon key only |
| `NEXT_PUBLIC_LINZ_API_KEY` | LINZ Data Service | wired now, used when tiles land |

**Never** add server-only secrets (Supabase service-role key, `ANTHROPIC_API_KEY`,
`GEMINI_API_KEY`) — and never give any of them a `NEXT_PUBLIC_` prefix.

## Health check

`GET /health` runs `select count(*) from geographies` through the server Supabase
client. It returns `{ "ok": true, "geographies": 0 }` until data lands — that 0 is
expected at this milestone.

## Database

Migrations live in [`supabase/migrations`](supabase/migrations):

- **`0001_core_schema.sql`** — applied. Five reference tables (`geographies`,
  `sources`, `metric_definitions`, `metric_values`, `schools`) + PostGIS, RLS with
  public-read policies, and the Tier-1 source seed.
- **`0002_embeddings.sql`** — **staged but NOT applied.** Its pgvector dimension is
  a placeholder pending the locked Gemini embedding model (see the file header).
  Do not apply until that dimension is confirmed.
