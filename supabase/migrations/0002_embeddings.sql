-- ============================================================================
-- NZ Suburb Intelligence — Embeddings (migration 0002)  [STAGED — DO NOT APPLY YET]
-- Apply at M2 / TRI-14, AFTER the embedding dimension is locked (TRI-11).
--
-- The vector dimension below is a PLACEHOLDER. Before applying:
--   1. Confirm the exact Gemini embedding model + its output dimension against
--      Google's current docs (pgvector fixes the dimension at column creation —
--      this is the one costly-to-reverse choice in the whole schema).
--   2. Set vector(<DIM>) to match that dimension exactly.
-- Rule: the model that embeds at ingestion must also embed the live query
--       (same model, same dimension) — store the model name on every row so a
--       future switch is a known, deliberate re-embed of everything.
-- ============================================================================

create extension if not exists vector;

create table suburb_embeddings (
  id         bigint generated always as identity primary key,
  geo_id     bigint not null references geographies(id) on delete cascade,
  content    text   not null,                 -- the generated profile text that was embedded
  embedding  vector(768),                     -- <DIM> PLACEHOLDER — set to the locked Gemini dimension
  model      text   not null,                 -- exact embedding model id (consistency rule)
  created_at timestamptz not null default now(),
  unique (geo_id)
);

-- ANN index — add once row count is known; pick HNSW or IVFFlat params then.
-- create index on suburb_embeddings using hnsw (embedding vector_cosine_ops);

-- Server-only: no anon read policy. Embeddings are queried via the service role
-- inside API routes, never from the browser.
alter table suburb_embeddings enable row level security;
