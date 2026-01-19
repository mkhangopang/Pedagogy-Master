-- EDUNEXUS AI: PERSISTENT INFRASTRUCTURE LAYER (v34.0)
-- TARGET: Eliminate "Profile Exists" and "Handshake Failure" errors.

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. IDEMPOTENT HEALTH RPCs
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

-- 3. IDENTITY LAYER (RESILIENT)
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

-- 4. FIX: "Profile already exists" error handling
-- This function now updates the existing record if a conflict occurs
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, plan, queries_limit)
  VALUES (
    NEW.id, 
    NEW.email, 
    split_part(NEW.email, '@', 1), 
    'teacher', 
    'free', 
    30
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. ASSET & GRID TABLES
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

-- 6. SECURITY & PERMISSIONS (Eliminates "Node Disconnected" UI error)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Profile Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own profile') THEN
        CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile') THEN
        CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
    END IF;

    -- Document Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own documents') THEN
        CREATE POLICY "Users can manage own documents" ON public.documents FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- GRANT EXECUTION (Critical for frontend status checking)
GRANT EXECUTE ON FUNCTION get_extension_status(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_vector_dimensions() TO anon, authenticated;

-- 7. DIAGNOSTIC VIEW
CREATE OR REPLACE VIEW public.rag_health_report AS
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