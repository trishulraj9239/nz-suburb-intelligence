-- ============================================================================
-- NZ Suburb Intelligence — Similarity search (migration 0004, TRI-30)
-- suburb_embeddings has RLS with NO anon policy (server-only data). These
-- SECURITY DEFINER functions are the narrow, controlled read path: they expose
-- only (sa2_code, name, similarity) — never the vectors or profile text.
-- Cosine distance (<=>) over unit-normalised gemini-embedding-001@768 vectors.
-- ============================================================================

create or replace function match_suburbs_by_code(p_sa2_code text, p_count int default 5)
returns table (sa2_code text, name text, similarity numeric)
language sql
stable
security definer
set search_path = public
as $$
  select g.sa2_code,
         g.name,
         round((1 - (se.embedding <=> q.embedding))::numeric, 4) as similarity
  from suburb_embeddings se
  join geographies g on g.id = se.geo_id and g.is_active
  cross join (
    select se2.embedding
    from suburb_embeddings se2
    join geographies g2 on g2.id = se2.geo_id
    where g2.sa2_code = p_sa2_code
  ) q
  where g.sa2_code <> p_sa2_code
  order by se.embedding <=> q.embedding
  limit least(greatest(p_count, 1), 10);
$$;

create or replace function match_suburbs_by_vector(p_embedding vector(768), p_count int default 5)
returns table (sa2_code text, name text, similarity numeric)
language sql
stable
security definer
set search_path = public
as $$
  select g.sa2_code,
         g.name,
         round((1 - (se.embedding <=> p_embedding))::numeric, 4) as similarity
  from suburb_embeddings se
  join geographies g on g.id = se.geo_id and g.is_active
  order by se.embedding <=> p_embedding
  limit least(greatest(p_count, 1), 10);
$$;

grant execute on function match_suburbs_by_code(text, int) to anon, authenticated;
grant execute on function match_suburbs_by_vector(vector, int) to anon, authenticated;
