-- ============================================================================
-- NZ Suburb Intelligence — Embeddings (migration 0002)  [APPLIED — TRI-14]
-- Dimension LOCKED per TRI-11 (2026-06-11): gemini-embedding-001 @ 768 dims.
--
-- Decision record:
--   * Model: gemini-embedding-001 (Stable/GA; supports 128–3072 via MRL,
--     recommended 768/1536/3072, default 3072).
--   * 768 chosen: ample quality for ~600 short suburb profiles; 4x less
--     storage than 3072; stays under pgvector's 2000-dim ANN index limit
--     (3072 would block HNSW/IVFFlat on the `vector` type).
--   * Caveat: only 3072-dim output is pre-normalized — re-normalize 768-dim
--     embeddings before cosine similarity.
-- Rule: the model that embeds at ingestion must also embed the live query
--       (same model, same dimension) — store the model name on every row so a
--       future switch is a known, deliberate re-embed of everything.
-- ============================================================================

create extension if not exists vector;

create table suburb_embeddings (
  id         bigint generated always as identity primary key,
  geo_id     bigint not null references geographies(id) on delete cascade,
  content    text   not null,                 -- the generated profile text that was embedded
  embedding  vector(768),                     -- LOCKED: gemini-embedding-001 @ 768 (TRI-11)
  model      text   not null,                 -- exact embedding model id (consistency rule)
  created_at timestamptz not null default now(),
  unique (geo_id)
);

-- ANN index — add once row count is known; pick HNSW or IVFFlat params then.
-- create index on suburb_embeddings using hnsw (embedding vector_cosine_ops);

-- Server-only: no anon read policy. Embeddings are queried via the service role
-- inside API routes, never from the browser.
alter table suburb_embeddings enable row level security;
