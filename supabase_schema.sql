-- EDUNEXUS AI: MASTER INFRASTRUCTURE REPAIR v61.0
-- TARGET: Implement "Exact Match" Priority Boosting for SLO precision

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
SET search_path = public, extensions;

-- 4. NUCLEAR CLEANUP OF OVERLOADED FUNCTIONS
DO $$
DECLARE
    _f record;
BEGIN
    FOR _f IN (
        SELECT n.nspname as schema_name, 
               p.proname as func_name, 
               pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'hybrid_search_chunks_v3'
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || _f.schema_name || '.' || _f.func_name || '(' || _f.args || ') CASCADE';
    END LOOP;
END $$;

-- 5. RE-INITIALIZE HEALTH VIEW
DROP VIEW IF EXISTS public.rag_health_report CASCADE;

-- 6. REPAIR SEARCH ENGINE (Hybrid v3 with 70/30 weights + EXACT MATCH BOOST)
-- SIGNATURE: (TEXT, extensions.vector, INTEGER, UUID[], UUID, TEXT[], TEXT[], TEXT[], TEXT[])
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
            -- BASE HYBRID SCORE (70% Vector | 30% Keyword)
            (((1 - (dc.embedding <=> query_embedding)) * 0.7) + 
            (ts_rank(to_tsvector('english', dc.chunk_text), plainto_tsquery('english', query_text)) * 0.3)) +
            
            -- EXACT SLO MATCH BOOST
            -- We add a huge constant (10.0) if the normalized tag matches perfectly. 
            -- This ensures that "S08C03" matches ALWAYS beat "S08A03" regardless of semantic similarity.
            (CASE 
                WHEN filter_tags IS NOT NULL AND dc.slo_codes && filter_tags THEN 10.0 
                ELSE 0.0 
             END)
        )::DOUBLE PRECISION as combined_score,
        dc.metadata
    FROM public.document_chunks dc
    JOIN public.documents d ON dc.document_id = d.id
    WHERE 
        (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
        AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
        AND (filter_grades IS NULL OR dc.grade_levels && filter_grades)
        AND (filter_subjects IS NULL OR dc.topics && filter_subjects)
        -- Optimization: If tags are provided, we don't strictly filter (to allow semantic fallback), 
        -- but the boost above will sort exact matches to the top.
        AND (filter_content_types IS NULL OR dc.metadata->>'type' = ANY(filter_content_types))
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- 7. RECREATE HEALTH VIEW
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

-- 8. UNAMBIGUOUS PERMISSIONS
GRANT EXECUTE ON FUNCTION public.hybrid_search_chunks_v3(TEXT, extensions.vector, INTEGER, UUID[], UUID, TEXT[], TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;
GRANT SELECT ON public.rag_health_report TO authenticated;