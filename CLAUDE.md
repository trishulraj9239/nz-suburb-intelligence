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
client → `{ "ok": true, "geographies": N }`.

## Stack & architecture
- **Next.js 16.2.9 + React 19.2.4** (App Router, TypeScript) on **Vercel**. Newer than most training
  data — verify APIs against installed types/docs, don't assume.
- **Supabase** (Postgres + PostGIS) via `@supabase/ssr` — separate **browser** and **server** clients.
- **MapLibre GL** — SA2 choropleth map, LINZ topolite vector basemap, hover tooltips, fly-to.
- **Intelligence layer** — `@anthropic-ai/sdk`: text-to-query, cited answers, RAG over suburb embeddings.
- **Answer surface (M16) — one brain, one body, two frames.** `lib/workspace.tsx` is the
  ONLY caller of `/api/ask` (fetch, NDJSON parse, abort/staleness guard, `AnswerTurn[]`);
  `components/answer-thread.tsx` is the only renderer; `answer-strip.tsx` (desktop) and the
  sheet's Answer tab are thin frames with zero answer logic, and exactly ONE is mounted at a
  time via `lib/use-is-lg.ts` — never `hidden lg:block` co-mounting. **Do not add fetching or
  answer state to a surface**: the invariant is that crossing the `lg` breakpoint mid-stream
  keeps painting the same answer on one `/api/ask` call (`scripts/test/tri83-verify.mjs`).
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

## Design tokens & type scale (TRI-145)
- `lib/tokens.ts` is the single source of truth; `npm run tokens` regenerates `app/tokens.css`
  (committed). `npm run test:unit` fails if the CSS is stale, if any `text-[9|10|11px]` appears,
  or if a hex colour sits outside `lib/tokens.ts` / `app/tokens.css`.
- Type scale utilities: `text-micro` (12 px, the floor — chips, axes) · `text-label` (13) ·
  `text-body` (14) · `text-value` (15) · `text-h3` (16) · `text-h2` (20) · `text-kpi` (22).
- Radii `rounded-control|card|sheet|chip`; shadows `shadow-card|pop|sheet`; colours
  `bg-canvas` … `text-accent`, categorical `cat-a…g` (Okabe-Ito, compare/modes only), hazard
  neutral ramp `hz-1…5` (never red–green), map layer hues `layer-*`, section icon hues `section-*`.
- Shell primitives: `components/popover.tsx`, `tabs.tsx` (`role=tab`), `sheet.tsx`
  (phone bottom sheet, `role=slider` handle), `you-menu.tsx` (phone fold), `map-overlay-dock.tsx`.
  Touch targets ≥ 40 px; `:focus-visible` ring; `motion-reduce` on transitions.

## Visual grammar primitives (TRI-147)
- One primitive per metric class in `components/viz/`: `BulletBar` (value vs region), `RangeBar`
  (LQ/median/UQ), `Sparkline`, `SlopeChart` (censuses, straight segments), `Stacked100`,
  `MultiBars` (multi-response), `DecileStrip`, `LayerBullets` (hazard count on the `hz` ramp),
  `DotPlot` (travel modes), `DotStrip` (compare a/b/c), `Heatmap`; `EmptyTrack` is the shared
  hatched empty state. Row/card shells: `components/metric-row.tsx`, `section-card.tsx`; provenance:
  `components/source-chip.tsx` (`SourceChip` with `geometry`, `QualityMark`, `StatusPill`;
  `provenance.tsx` re-exports it).
- Every primitive takes `status` (`lib/viz/status.ts`: exact · est. · approx · computed · suppressed ·
  unavailable) and gets `role="img"` + an aria-label from `lib/viz/aria.ts` that names the status.
  Suppressed/unavailable draw a full-length hatched track with the reason — never a zero-length bar.
  est./approx markers are OUTLINED (dots: tinted), computed is dashed; colour never carries quality.
- The regional axis is the interquartile band p25–p75 with min/max whiskers fenced at Tukey limits
  and a median tick (`lib/viz/scale.ts`); `judged` picks harbour vs ink for the marker, never good/bad.
- Gallery at `/dev/primitives` (404 in production); `node scripts/test/tri-design-verify.mjs`
  asserts labels, hatch, outlines, 4.5:1 text / 3:1 marks in both themes, and the 12 px floor.

## Profile on the kit (TRI-148)
- `components/profile-panel.tsx` is composition only: AddressFacts → banner → `ProfileHeader` →
  `KpiCards` → six `SectionCard`s in persona order → `SchoolsCard`. `lib/sections.ts` maps registry
  dimensions onto cards (People absorbs Deprivation; unclaimed dimensions render as a `GenericCard`,
  never hidden) and lists `EXPECTED_ROWS` that draw a hatched track when the source suppressed them.
- `components/profile/rows.tsx`: `ScalarRow` (bullet on the regional axis + trend + percentile note +
  chip), `Trend` (Sparkline past the history gate, SlopeChart for census vintages, words for NZDep),
  `BreakdownBlock` (Stacked100 with the Auckland reference from `fetchRegionalBreakdown()`, MultiBars
  for ethnicity). Chips hoist to the card header when every row shares a source (`hoistChip`).
- Getting around = one DotPlot (CBD / Airport / saved places via `lib/use-anchor-commute.ts`, one hook
  for the list); no places → hatched row + "Add a place" (dispatches `nzsi:open-places`).
- Hazards keep the countable badge sentence, per-row "Auckland median X", the verbatim caveat, and the
  neutral ramp. Verify: the profile section of `tri-design-verify.mjs` + tri106/112/122–133/141.

## Compare on the kit (TRI-149)
- `components/compare/*` (`compare-panel.tsx` re-exports): a header legend (letter A/B/C + Okabe-Ito hue
  per suburb, address heads, remove controls), then ONE row per metric — `CompareRow` = label | `DotStrip`
  on the shared Auckland axis | a value per suburb with its letter and best/budget badges | provenance —
  grouped into the same persona-ordered `SectionCard`s as the Profile. No desktop/mobile co-mount.
- `lib/compare.ts`: `entriesFor`, `bestSet` (registry direction only, never among ties), `differs`
  (≥ 10 percentile points; travel ≥ 10 min drive / 15 min cycle-walk; a missing value always differs),
  `sharedProvenance` (one chip when source · vintage · confidence agree, else per-suburb quality marks).
- Getting around is flipped: rows are trips (CBD × mode, Airport, saved places via
  `useAnchorCommutesMulti`), dots are suburbs on a 0–120 min domain. The percentile `Heatmap` is a
  collapsed "Percentile overview" of judged metrics only — hazards, deprivation, consents never ranked.
- Phones: `AddressFactsPager` = snap-scrolling full-width `AddressFacts` cards with a `role=tablist`
  pager; desktop keeps the grid. Testids kept: `compare-address-facts`, `compare-address-head`,
  `same-area-note`, one `address-facts` per pin, `Remove … from comparison`.

## "This property" panel on the grammar (TRI-150)
- `components/address-facts.tsx` re-exports `PropertyPanel` from `components/property/` — one file per
  epistemic group (records, block-stats, plan-overlays, point-hazards, drive-times, nearby, link-outs)
  over `lib/property/fetch.ts` (typed responses, the per-pin `cachedJson` memo, `usePointLookup`,
  `usePointHazards` two-phase, `useDriveFromPin`) and `lib/property/copy.ts` (every fixed string,
  verbatim — the panel's wording is frozen).
- Grammar: six `epistemic-*` h4s at 13 px semibold in the same order; point rows carry a `StatusPill`
  (icon + the council's own status word); every chip names its tested geometry ("address point",
  "rating unit", "SA1 block"); links on `text-accent`; the area-level caveat still tops and foots
  the models group. Testids unchanged (tri122–133/141 are the contract).

## Answer surfaces on the grammar + phone harness (TRI-151)
- `answer-thread.tsx` stays the ONE body (M16): citation chips are ≥ 24 px and still the only amber
  (`data-testid="citation-chip"`); the Sources footer renders `SourceChip`s (the literal "Sources:"
  stays); result pills are 40 px on phones / 32 px from `lg` (`data-testid="result-pill"`).
  `results-panel.tsx`: table `data-testid="results-table"`, 13 px headers, rows ≥ 40 px on phones.
- Phone regression: `scripts/test/_viewport.mjs` reads `NZSI_VIEWPORT=390x844`; `npm run test:phone`
  (`run-phone.mjs`) replays tri122/123/126–132/141 at phone width, 20 s apart. `npm run test:design`
  runs the whole design verify (gallery → profile → compare → property → answer).
