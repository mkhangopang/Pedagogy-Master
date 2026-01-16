-- EDUNEXUS AI: MASTER INFRASTRUCTURE SCHEMA v26.0
-- TARGET: RAG Resilience & Diagnostic Monitoring

-- 1. ENABLE NEURAL VECTOR ENGINE
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. PROFILES TABLE (Adaptive Intelligence Hub)
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

-- 3. DOCUMENTS TABLE (Curriculum Assets)
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

-- 4. DOCUMENT_CHUNKS TABLE (Vector Grid Nodes)
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(768),
    slo_codes TEXT[] DEFAULT '{}',
    chunk_index INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. THE NEURAL ENGINE: HYBRID SEARCH RPC v2 (ULTIMATE)
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
    COALESCE((dc.metadata->>'page_number')::INT, 0) AS page_number,
    COALESCE(dc.metadata->>'section_title', 'General') AS section_title,
    (
      (1 - (dc.embedding <=> query_embedding)) +
      CASE WHEN dc.slo_codes && boost_tags THEN 5.0 ELSE 0 END +
      CASE WHEN dc.document_id = priority_document_id THEN 0.5 ELSE 0 END
    ) AS combined_score
  FROM document_chunks dc
  WHERE dc.document_id = ANY(filter_document_ids)
    AND dc.embedding IS NOT NULL
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- 6. DIAGNOSTIC VIEW: RAG HEALTH
-- v26 Fix: Refactored SLO stats to use LATERAL unnest to prevent aggregate error 0A000
CREATE OR REPLACE VIEW rag_health_report AS
WITH flattened_slos AS (
    SELECT 
        document_id, 
        unnest(slo_codes) as slo
    FROM document_chunks
),
slo_stats AS (
    SELECT 
        document_id, 
        count(DISTINCT slo) as distinct_slos
    FROM flattened_slos
    GROUP BY document_id
)
SELECT 
    d.id,
    d.name,
    d.status,
    d.rag_indexed,
    d.is_selected,
    count(dc.id) as chunk_count,
    COALESCE(ss.distinct_slos, 0) as distinct_slo_count,
    CASE 
        WHEN d.rag_indexed = true AND count(dc.id) = 0 THEN 'BROKEN: Missing Chunks'
        WHEN d.rag_indexed = true AND COALESCE(ss.distinct_slos, 0) = 0 THEN 'WARNING: No SLOs Tagged'
        WHEN d.rag_indexed = false AND count(dc.id) > 0 THEN 'WARNING: Partial Sync'
        WHEN d.is_selected = true AND d.rag_indexed = false THEN 'CRITICAL: Selected but Unindexed'
        WHEN count(dc.id) > 0 THEN 'HEALTHY'
        ELSE 'PENDING'
    END as health_status
FROM documents d
LEFT JOIN document_chunks dc ON d.id = dc.document_id
LEFT JOIN slo_stats ss ON d.id = ss.document_id
GROUP BY d.id, d.name, d.status, d.rag_indexed, d.is_selected, ss.distinct_slos;

-- 7. DIAGNOSTIC RPC: EXTENSION CHECK
CREATE OR REPLACE FUNCTION get_extension_status(ext TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM pg_extension WHERE extname = ext);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. DIAGNOSTIC RPC: DIMENSION CHECK
CREATE OR REPLACE FUNCTION get_vector_dimensions()
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT atttypmod - 4
        FROM pg_attribute
        WHERE attrelid = 'public.document_chunks'::regclass
        AND attname = 'embedding'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RLS POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own documents" ON documents FOR ALL USING (auth.uid() = user_id);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own chunks" ON document_chunks FOR ALL 
USING (EXISTS (SELECT 1 FROM documents WHERE id = document_id AND user_id = auth.uid()));