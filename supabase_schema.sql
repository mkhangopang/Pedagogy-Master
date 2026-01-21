-- EDUNEXUS AI: PRODUCTION INFRASTRUCTURE v47.0
-- TARGET: FIX SECURITY LINT (SECURITY DEFINER VIEW) & GLOBAL ADMIN VISIBILITY

-- 1. BASE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. SYSTEM DIAGNOSTICS (Restricted Security Definer Functions)
-- These must be security definer to access system catalogs, but we restrict execution.
CREATE OR REPLACE FUNCTION get_extension_status(ext TEXT) 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM pg_extension WHERE extname = ext);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_vector_dimensions() 
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_extension_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_vector_dimensions() TO authenticated;

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

-- 4. RESILIENT AUTH TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    embedding vector(768),
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

-- 6. SECURITY & PERMISSIONS (RESOLVING LINT ERROR)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Dynamic Policy: Users see their own, Admins see everything.
CREATE OR REPLACE FUNCTION public.is_master_admin() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT role = 'app_admin' 
    FROM public.profiles 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles 
FOR SELECT USING (auth.uid() = id OR is_master_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles 
FOR UPDATE USING (auth.uid() = id);

-- Documents Policies
DROP POLICY IF EXISTS "Users can manage own documents" ON public.documents;
CREATE POLICY "Users can manage own documents" ON public.documents 
FOR ALL USING (auth.uid() = user_id OR is_master_admin());

-- Chunks Policies
DROP POLICY IF EXISTS "Users can read relevant chunks" ON public.document_chunks;
CREATE POLICY "Users can read relevant chunks" ON public.document_chunks 
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.documents WHERE id = document_id AND (user_id = auth.uid() OR is_master_admin()))
);

-- 7. RECOVERY VIEW (FIX: Defined as SECURITY INVOKER via WITH clause)
DROP VIEW IF EXISTS public.rag_health_report;
CREATE VIEW public.rag_health_report 
WITH (security_invoker = true) -- RESOLVES SUPABASE LINT ERROR 0010
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

GRANT SELECT ON public.rag_health_report TO authenticated;