-- EDUNEXUS AI: PRODUCTION INFRASTRUCTURE v48.0
-- TARGET: RESOLVE LINTER (SEARCH_PATH & EXTENSION_IN_PUBLIC)

-- 1. SECURE EXTENSIONS LAYER
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. SYSTEM DIAGNOSTICS (Security Hardened)
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

-- 3. IDENTITY LAYER
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

-- 4. RESILIENT AUTH TRIGGER (Security Hardened)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. ASSET TABLES
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_type TEXT DEFAULT 'markdown',
    status TEXT DEFAULT 'processing',
    is_approved BOOLEAN DEFAULT FALSE,
    extracted_text TEXT,
    file_path TEXT,
    storage_type TEXT DEFAULT 'r2',
    curriculum_name TEXT,
    authority TEXT,
    subject TEXT,
    grade_level TEXT,
    version_year TEXT,
    generated_json JSONB,
    version INTEGER DEFAULT 1,
    is_selected BOOLEAN DEFAULT FALSE,
    rag_indexed BOOLEAN DEFAULT FALSE,
    document_summary TEXT,
    difficulty_level TEXT,
    gemini_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding extensions.vector(768),
    slo_codes TEXT[] DEFAULT '{}',
    grade_levels TEXT[] DEFAULT '{}',
    topics TEXT[] DEFAULT '{}',
    unit_name TEXT,
    difficulty TEXT,
    bloom_levels TEXT[] DEFAULT '{}',
    chunk_index INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SECURITY & PERMISSIONS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_master_admin() 
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT role = 'app_admin' 
    FROM public.profiles 
    WHERE id = auth.uid()
  );
END;
$$;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles 
FOR SELECT USING (auth.uid() = id OR is_master_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles 
FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can manage own documents" ON public.documents;
CREATE POLICY "Users can manage own documents" ON public.documents 
FOR ALL USING (auth.uid() = user_id OR is_master_admin());

DROP POLICY IF EXISTS "Users can read relevant chunks" ON public.document_chunks;
CREATE POLICY "Users can read relevant chunks" ON public.document_chunks 
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.documents WHERE id = document_id AND (user_id = auth.uid() OR is_master_admin()))
);

-- 7. RECOVERY VIEW (Security Hardened)
DROP VIEW IF EXISTS public.rag_health_report;
CREATE VIEW public.rag_health_report 
WITH (security_invoker = true) 
AS
SELECT 
    d.id,
    d.name,
    d.is_selected,
    d.rag_indexed,
    COUNT(dc.id) as chunk_count,
    CASE 
        WHEN d.rag_indexed = true AND COUNT(dc.id) = 0 THEN 'BROKEN (NO CHUNKS)'
        WHEN d.rag_indexed = false AND COUNT(dc.id) > 0 THEN 'BROKEN (STALE INDEX)'
        WHEN COUNT(dc.id) > 0 THEN 'HEALTHY'
        ELSE 'PENDING'
    END as health_status
FROM documents d
LEFT JOIN document_chunks dc ON d.id = dc.document_id
GROUP BY d.id, d.name, d.is_selected, d.rag_indexed;

-- 8. SEARCH HELPERS (Security Hardened)
CREATE OR REPLACE FUNCTION public.hybrid_search_chunks_v3(
    query_embedding extensions.vector(768),
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
      AND (filter_grades IS NULL OR dc.grade_levels && filter_grades)
      AND (filter_topics IS NULL OR dc.topics && filter_topics)
      AND (filter_bloom IS NULL OR dc.bloom_levels && filter_bloom)
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

GRANT SELECT ON public.rag_health_report TO authenticated;
GRANT EXECUTE ON FUNCTION get_extension_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_vector_dimensions() TO authenticated;