-- EDUNEXUS AI: ULTIMATE INFRASTRUCTURE SCHEMA v20.0
-- TARGET: Pedagogical Tool Factory Logic & Tag-Aware RAG

-- 1. ENABLE NEURAL VECTOR ENGINE
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. PROFILES TABLE (Adaptive Intelligence Hub)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    name TEXT,
    email TEXT,
    role TEXT DEFAULT 'teacher', -- teacher, enterprise_admin, app_admin
    plan TEXT DEFAULT 'free', -- free, pro, enterprise
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

-- 3. DOCUMENTS TABLE (Curriculum Assets)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_type TEXT DEFAULT 'markdown',
    status TEXT DEFAULT 'processing', -- processing, ready, failed, completed
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

-- 4. DOCUMENT_CHUNKS TABLE (Vector Grid Nodes)
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(768), -- Optimized for text-embedding-004
    slo_codes TEXT[] DEFAULT '{}',
    chunk_index INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SLO_DATABASE TABLE (Structured Curriculum Knowledge)
CREATE TABLE IF NOT EXISTS public.slo_database (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents ON DELETE CASCADE,
    slo_code TEXT NOT NULL,
    slo_full_text TEXT NOT NULL,
    subject TEXT,
    grade_level TEXT,
    bloom_level TEXT,
    cognitive_complexity TEXT, -- Low, Medium, High
    teaching_strategies TEXT[] DEFAULT '{}',
    assessment_ideas TEXT[] DEFAULT '{}',
    prerequisite_concepts TEXT[] DEFAULT '{}',
    common_misconceptions TEXT[] DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}',
    page_number INTEGER,
    extraction_confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, slo_code)
);

-- 6. TEACHER_PROGRESS TABLE (Coverage Monitoring)
CREATE TABLE IF NOT EXISTS public.teacher_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE,
    slo_code TEXT NOT NULL,
    status TEXT DEFAULT 'planning', -- planning, teaching, completed
    taught_date DATE,
    student_mastery_percentage INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, slo_code)
);

-- 7. NEURAL_BRAIN TABLE (Global System Prompts)
CREATE TABLE IF NOT EXISTS public.neural_brain (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_prompt TEXT NOT NULL,
    bloom_rules TEXT,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. OUTPUT_ARTIFACTS TABLE (Generated Pedagogical Tools)
CREATE TABLE IF NOT EXISTS public.output_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE,
    content_type TEXT NOT NULL, -- lesson-plan, assessment, rubric, etc.
    content TEXT NOT NULL,
    metadata JSONB,
    status TEXT DEFAULT 'generated', -- generated, exported, accepted, abandoned, edited
    edit_depth INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. FEEDBACK_EVENTS TABLE (Behavioral Signal Capture)
CREATE TABLE IF NOT EXISTS public.feedback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE,
    artifact_id UUID REFERENCES public.output_artifacts ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- export, accept, abandon, edit
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. AI_GENERATED_CONTENT TABLE (Intelligent Multi-Teacher Cache)
CREATE TABLE IF NOT EXISTS public.ai_generated_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slo_code TEXT NOT NULL,
    content_type TEXT NOT NULL,
    content TEXT NOT NULL,
    generated_by TEXT,
    usage_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(slo_code, content_type)
);

-- 11. THE NEURAL ENGINE: HYBRID SEARCH RPC v2 (ULTIMATE)
-- Optimized for Tool Factory logic: High-precision SLO matching
DROP FUNCTION IF EXISTS hybrid_search_chunks_v2(vector, integer, uuid[], uuid, text[]);

CREATE OR REPLACE FUNCTION hybrid_search_chunks_v2(
  query_embedding vector(768),
  match_count INT,
  filter_document_ids UUID[],
  priority_document_id UUID DEFAULT NULL,
  boost_tags TEXT[] DEFAULT '{}'
)
RETURNS TABLE (
  chunk_id UUID,
  chunk_text TEXT,
  slo_codes TEXT[],
  page_number INT,
  section_title TEXT,
  combined_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id AS chunk_id,
    dc.chunk_text,
    dc.slo_codes,
    (dc.metadata->>'page_number')::INT AS page_number,
    (dc.metadata->>'section_title') AS section_title,
    (
      -- Semantic Vector Similarity (Cosine distance to similarity)
      (1 - (dc.embedding <=> query_embedding)) +
      
      -- MASSIVE SLO TAG BOOST (Crucial for seeding Tool Generation)
      -- If any tag in boost_tags overlaps with the chunk's slo_codes, we boost significantly.
      CASE 
        WHEN dc.slo_codes && boost_tags THEN 5.0 
        ELSE 0 
      END +
      
      -- Priority Document context weighting
      CASE 
        WHEN dc.document_id = priority_document_id THEN 0.5 
        ELSE 0 
      END
    ) AS combined_score
  FROM document_chunks dc
  WHERE dc.document_id = ANY(filter_document_ids)
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- RLS POLICIES (Simplified for Admin Setup)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own documents" ON documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own documents" ON documents FOR ALL USING (auth.uid() = user_id);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view chunks of own documents" ON document_chunks FOR SELECT 
USING (EXISTS (SELECT 1 FROM documents WHERE id = document_id AND user_id = auth.uid()));

ALTER TABLE teacher_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own progress" ON teacher_progress FOR ALL USING (auth.uid() = user_id);

ALTER TABLE output_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own artifacts" ON output_artifacts FOR ALL USING (auth.uid() = user_id);