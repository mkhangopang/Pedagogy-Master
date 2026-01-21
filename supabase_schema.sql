-- EDUNEXUS AI: MASTER INFRASTRUCTURE REPAIR v55.0
-- TARGET: RESOLVE ERROR 42P16 (Cannot drop columns from view)

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

-- 4. ROBUST CLEANUP (Functions & Views)
-- Dropping the view first to prevent dependency issues during function drops
DROP VIEW IF EXISTS public.rag_health_report CASCADE;

DO $$
DECLARE
    _sql text;
BEGIN
    SELECT INTO _sql
        string_agg(format('DROP FUNCTION %s(%s);', oid::regproc, pg_get_function_identity_arguments(oid)), ' ')
    FROM pg_proc
    WHERE proname IN ('hybrid_search_chunks_v3', 'semantic_search_chunks', 'get_vector_dimensions', 'get_extension_status')
      AND pronamespace = 'public'::regnamespace;

    IF _sql IS NOT NULL THEN
        EXECUTE _sql;
    END IF;
END $$;

-- 5. REPAIR TABLE DIMENSIONS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'embedding') THEN
        ALTER TABLE public.document_chunks ALTER COLUMN embedding TYPE extensions.vector(768);
    END IF;
END $$;

-- 6. REPAIR SEARCH ENGINE (Hybrid v3 with Metadata)
CREATE OR REPLACE FUNCTION public.hybrid_search_chunks_v3(
    query_embedding extensions.vector,
    match_count INTEGER,
    filter_document_ids UUID[],
    priority_document_id UUID DEFAULT NULL,
    boost_slo_codes TEXT[] DEFAULT '{}',
    filter_grades TEXT[] DEFAULT NULL,
    filter_topics TEXT[] DEFAULT NULL,
    filter_bloom TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    chunk_id UUID,
    chunk_text TEXT,
    document_id UUID,
    slo_codes TEXT[],
    section_title TEXT,
    page_number INTEGER,
    combined_score DOUBLE PRECISION,
    grade_levels TEXT[],
    topics TEXT[],
    bloom_levels TEXT[]
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
        dc.slo_codes,
        COALESCE(dc.metadata->>'section_title', 'General')::TEXT as section_title,
        COALESCE(dc.metadata->>'page_number', '0')::INTEGER as page_number,
        ((1 - (dc.embedding <=> query_embedding)) * 0.7) + 
        (CASE WHEN dc.slo_codes && boost_slo_codes THEN 0.3 ELSE 0 END) +
        (CASE WHEN dc.document_id = priority_document_id THEN 0.05 ELSE 0 END) as combined_score,
        dc.grade_levels,
        dc.topics,
        dc.bloom_levels
    FROM public.document_chunks dc
    WHERE dc.document_id = ANY(filter_document_ids)
      AND (filter_grades IS NULL OR dc.grade_levels && filter_grades)
      AND (filter_topics IS NULL OR dc.topics && filter_topics)
      AND (filter_bloom IS NULL OR dc.bloom_levels && filter_bloom)
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- 7. SEMANTIC SEARCH
CREATE OR REPLACE FUNCTION public.semantic_search_chunks(
    query_embedding extensions.vector,
    match_count INTEGER DEFAULT 10,
    filter_document_ids UUID[] DEFAULT NULL,
    filter_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    similarity DOUBLE PRECISION,
    metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.chunk_text as content,
        (1 - (dc.embedding <=> query_embedding)) as similarity,
        dc.metadata
    FROM public.document_chunks dc
    JOIN public.documents d ON dc.document_id = d.id
    WHERE (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
      AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 8. UTILITIES
CREATE OR REPLACE FUNCTION public.get_extension_status(ext TEXT) 
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM pg_extension WHERE extname = ext);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vector_dimensions() 
RETURNS INTEGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN (
        SELECT atttypmod - 4 
        FROM pg_attribute 
        WHERE attrelid = 'public.document_chunks'::regclass 
        AND attname = 'embedding'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN 768;
END;
$$;

-- 9. PERFORMANCE INDEX
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw 
ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

-- 10. PERMISSIONS
GRANT EXECUTE ON FUNCTION public.hybrid_search_chunks_v3 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.semantic_search_chunks TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_extension_status TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vector_dimensions TO authenticated, service_role;

-- 11. HEALTH VIEW (Fresh Creation)
CREATE VIEW public.rag_health_report AS
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

GRANT SELECT ON public.rag_health_report TO authenticated;