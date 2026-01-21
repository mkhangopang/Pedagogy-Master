-- EDUNEXUS AI: MASTER INFRASTRUCTURE REPAIR v56.0
-- TARGET: Implement Advanced Hybrid Search with 70/30 Weighting

-- 1. SECURE SCHEMA LAYER
CREATE SCHEMA IF NOT EXISTS extensions;

-- 2. SAFE VECTOR ENGINE MIGRATION
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    IF (SELECT nspname FROM pg_extension e JOIN pg_namespace n ON e.extnamespace = n.oid WHERE e.extname = 'vector') != 'extensions' THEN
      ALTER EXTENSION vector SET SCHEMA extensions;
    END IF;
  ELSE
    CREATE EXTENSION vector WITH SCHEMA extensions;
  END IF;
END $$;

-- 3. GLOBAL SEARCH PATH ALIGNMENT
ALTER ROLE authenticated SET search_path TO public, extensions;
ALTER ROLE service_role SET search_path TO public, extensions;
ALTER ROLE postgres SET search_path TO public, extensions;

-- 4. CLEANUP OLD DEFINITIONS
DROP VIEW IF EXISTS public.rag_health_report CASCADE;
DROP FUNCTION IF EXISTS public.hybrid_search_chunks_v3(extensions.vector, INTEGER, UUID[], UUID, TEXT[], TEXT[], TEXT[], TEXT[]);

-- 5. REPAIR SEARCH ENGINE (Hybrid v3 with 70/30 weights and Granular Filters)
CREATE OR REPLACE FUNCTION public.hybrid_search_chunks_v3(
    query_text TEXT,
    query_embedding extensions.vector,
    match_count INTEGER,
    filter_document_ids UUID[] DEFAULT NULL,
    filter_user_id UUID DEFAULT NULL,
    filter_tags TEXT[] DEFAULT NULL,
    filter_subjects TEXT[] DEFAULT NULL,
    filter_grades TEXT[] DEFAULT NULL,
    filter_content_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    chunk_id UUID,
    chunk_text TEXT,
    document_id UUID,
    similarity DOUBLE PRECISION,
    text_rank REAL,
    combined_score DOUBLE PRECISION,
    metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id as chunk_id,
        dc.chunk_text,
        dc.document_id,
        (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION as similarity,
        ts_rank(to_tsvector('english', dc.chunk_text), plainto_tsquery('english', query_text)) as text_rank,
        (
            ((1 - (dc.embedding <=> query_embedding)) * 0.7) + 
            (ts_rank(to_tsvector('english', dc.chunk_text), plainto_tsquery('english', query_text)) * 0.3)
        )::DOUBLE PRECISION as combined_score,
        dc.metadata
    FROM public.document_chunks dc
    JOIN public.documents d ON dc.document_id = d.id
    WHERE 
        (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
        AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
        AND (filter_grades IS NULL OR dc.grade_levels && filter_grades)
        AND (filter_subjects IS NULL OR dc.topics && filter_subjects)
        AND (filter_tags IS NULL OR dc.slo_codes && filter_tags)
        AND (filter_content_types IS NULL OR dc.metadata->>'type' = ANY(filter_content_types))
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- 6. HEALTH VIEW (Recreated)
CREATE OR REPLACE VIEW public.rag_health_report AS
SELECT 
    d.id, 
    d.name, 
    d.is_selected,
    count(dc.id) as chunk_count,
    CASE 
        WHEN count(dc.id) = 0 THEN 'BROKEN: NO CHUNKS'
        WHEN d.rag_indexed = false THEN 'STALE: NEEDS REINDEX'
        ELSE 'HEALTHY'
    END as health_status
FROM public.documents d
LEFT JOIN public.document_chunks dc ON d.id = dc.document_id
GROUP BY d.id, d.name, d.is_selected, d.rag_indexed;

-- 7. PERMISSIONS
GRANT EXECUTE ON FUNCTION public.hybrid_search_chunks_v3 TO authenticated, service_role;
GRANT SELECT ON public.rag_health_report TO authenticated;