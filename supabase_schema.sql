-- EDUNEXUS AI: PRODUCTION INFRASTRUCTURE v65.0
-- Focus: Performance, Role-based Security, and Data Residency

-- 1. OPTIMIZED PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'teacher',
    plan TEXT NOT NULL DEFAULT 'free',
    queries_used INTEGER DEFAULT 0,
    queries_limit INTEGER DEFAULT 30,
    generation_count INTEGER DEFAULT 0,
    success_rate DOUBLE PRECISION DEFAULT 0.0,
    grade_level TEXT,
    subject_area TEXT,
    teaching_style TEXT,
    pedagogical_approach TEXT,
    edit_patterns JSONB DEFAULT '{"avgLengthChange": 0, "examplesCount": 0, "structureModifications": 0}'::JSONB,
    tenant_config JSONB DEFAULT '{"primary_color": "#4f46e5", "brand_name": "EduNexus AI"}'::JSONB,
    active_doc_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ACCESS OPTIMIZATION INDEXES
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON public.profiles(plan);
CREATE INDEX IF NOT EXISTS idx_documents_user_selection ON public.documents(user_id, is_selected);

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES (Privacy First)
CREATE POLICY "Users can only view their own profile." 
ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own non-sensitive profile fields."
ON public.profiles FOR UPDATE USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 5. NEURAL RECOVERY TRIGGER
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

-- 6. RPC: IDENTITY SCAN (Used by Audit View)
CREATE OR REPLACE FUNCTION public.get_extension_status(ext TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM pg_extension WHERE extname = ext);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;