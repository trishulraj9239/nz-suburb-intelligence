-- ============================================================================
-- TRI-30 — profile embeddings artifact → suburb_embeddings. Idempotent
-- (tri-48/tri-63/tri-68/tri-73 pattern). Run AFTER
-- scripts/etl/tri-30-embed-profiles.mjs output is committed and pushed;
-- http_get reads the raw GitHub URL — the branch segment must match where the
-- data lives (main after merge, the feature branch before it).
--
-- Every milestone that adds a sentence to profileText() re-embeds all 633
-- suburbs and re-runs this file, so retrieval text and displayed metrics can
-- never disagree. Model + dimension are LOCKED (gemini-embedding-001 @ 768,
-- TRI-11/0002) and stored per row — a model switch is a deliberate full
-- re-embed, never a silent mix.
--
-- Quota note: the Gemini free tier caps embed requests per MINUTE and per DAY
-- (~1000/day). One full 633-suburb run is ~2/3 of the daily bucket, which
-- resets 07:00 UTC — only one full re-embed per day is safe. The ETL script
-- checkpoints to data/embeddings/tri30-state.json (gitignored, content-keyed)
-- so an interrupted run resumes without re-spending quota.
-- ============================================================================

select http_set_curlopt('CURLOPT_TIMEOUT', '120');

with payload as (
  select content::jsonb as j
  from http_get('https://raw.githubusercontent.com/trishulraj9239/nz-suburb-intelligence/main/data/embeddings/tri30-embeddings.json')
),
r as (
  select x.* from payload, jsonb_to_recordset(payload.j)
    as x (g text, content text, e text)
)
insert into suburb_embeddings (geo_id, content, embedding, model)
select geo.id, r.content, r.e::vector(768), 'gemini-embedding-001'
from r
join geographies geo on geo.sa2_code = r.g and geo.geo_type = 'SA2'
on conflict (geo_id) do update
  set content = excluded.content,
      embedding = excluded.embedding,
      model = excluded.model,
      created_at = now();
