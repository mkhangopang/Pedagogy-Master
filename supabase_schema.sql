-- EDUNEXUS AI: INFRASTRUCTURE REPAIR v49.0
-- TARGET: FIX 42704 (Type Missing) & 42883 (Function Undefined)

-- 1. SECURE SCHEMA LAYER
CREATE SCHEMA IF NOT EXISTS extensions;

-- 2. SAFE VECTOR ENGINE MIGRATION
-- This moves the extension without dropping tables/data
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- If it's in public, move it. If it's already in extensions, this does nothing.
    IF (SELECT nspname FROM pg_extension e JOIN pg_namespace n ON e.extnamespace = n.oid WHERE e.extname = 'vector') = 'public' THEN
      ALTER EXTENSION vector SET SCHEMA extensions;
    END IF;
  ELSE
    CREATE EXTENSION vector WITH SCHEMA extensions;
  END IF;
END $$;

-- 3. GLOBAL SEARCH PATH ALIGNMENT
-- This allows the DB to find the 'vector' type without the 'extensions.' prefix
ALTER ROLE authenticated SET search_path TO public, extensions;
ALTER ROLE service_role SET search_path TO public, extensions;
ALTER ROLE postgres SET search_path TO public, extensions;

-- 4. IDENTITY LAYER REPAIR
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    name TEXT,
    email TEXT,
    role TEXT DEFAULT 'teacher',
    plan TEXT DEFAULT 'free',
    queries_used INTEGER DEFAULT 0,
    queries_limit INTEGER DEFAULT 30,
    grade_level TEXT,
    subject_area TEXT,
    teaching_style TEXT,
    pedagogical_approach TEXT,
    generation_count INTEGER DEFAULT 0,
    success_rate DOUBLE PRECISION DEFAULT 0,
    edit_patterns JSONB DEFAULT '{"avgLengthChange": 0, "examplesCount": 0, "structureModifications": 0}',
    active_doc_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Secure Auth Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, plan, queries_limit)
  VALUES (
    NEW.id, 
    NEW.email, 
    split_part(NEW.email, '@', 1), 
    CASE WHEN NEW.email = 'mkgopang@gmail.com' THEN 'app_admin' ELSE 'teacher' END, 
    CASE WHEN NEW.email = 'mkgopang@gmail.com' THEN 'enterprise' ELSE 'free' END, 
    CASE WHEN NEW.email = 'mkgopang@gmail.com' THEN 999999 ELSE 30 END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 5. REPAIR SEARCH ENGINE (hybrid_search_chunks_v3)
-- Using extensions.vector explicitly in the signature
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
    combined_score DOUBLE PRECISION
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
        (dc.metadata->>'section_title')::TEXT as section_title,
        (dc.metadata->>'page_number')::INTEGER as page_number,
        (1 - (dc.embedding <=> query_embedding)) * 
        (CASE WHEN dc.document_id = priority_document_id THEN 1.2 ELSE 1.0 END) *
        (CASE WHEN dc.slo_codes && boost_slo_codes THEN 1.3 ELSE 1.0 END) as combined_score
    FROM document_chunks dc
    WHERE dc.document_id = ANY(filter_document_ids)
      AND (filter_grades IS NULL OR dc.metadata->'grade_levels' ?| filter_grades)
      AND (filter_topics IS NULL OR dc.metadata->'topics' ?| filter_topics)
      AND (filter_bloom IS NULL OR dc.metadata->'bloom_levels' ?| filter_bloom)
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- 6. SYSTEM DIAGNOSTICS REPAIR
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

-- 7. CLEANUP OBSOLETE NODES
DROP FUNCTION IF EXISTS public.semantic_search_chunks;
DROP FUNCTION IF EXISTS public.find_similar_slos;
DROP FUNCTION IF EXISTS public.hybrid_search_chunks_v2;
DROP FUNCTION IF EXISTS public.find_slo_chunks;
DROP FUNCTION IF EXISTS public.hybrid_search_chunks;

-- 8. PERMISSIONS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT EXECUTE ON FUNCTION public.hybrid_search_chunks_v3 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_extension_status TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;