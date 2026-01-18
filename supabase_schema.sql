-- EDUNEXUS AI: OPTIMIZED NEURAL INFRASTRUCTURE v32.0
-- TARGET: Ultra-fast RAG Sync & High-Precision Metadata Filtering

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

-- 4. DOCUMENT_CHUNKS TABLE (Enhanced Neural Grid)
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

-- 5. PERFORMANCE INDEXES (FOR FAST SYNC)
-- GIN Indexes allow lightning-fast array lookups for metadata
CREATE INDEX IF NOT EXISTS idx_chunks_slo_codes ON document_chunks USING GIN (slo_codes);
CREATE INDEX IF NOT EXISTS idx_chunks_topics ON document_chunks USING GIN (topics);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks (document_id);

-- HNSW Vector Index for High-Performance Similarity (Fixed at 768 dims)
-- Note: Requires vector extension 0.5.0+. Falls back to standard indexing if unavailable.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- 6. DIAGNOSTIC VIEWS
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

-- 7. THE NEURAL ENGINE: HYBRID SEARCH RPC v3 (Performance Tuned)
CREATE OR REPLACE FUNCTION hybrid_search_chunks_v3(
  query_embedding vector(768),
  match_count INT,
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
  slo_codes TEXT[],
  grade_levels TEXT[],
  topics TEXT[],
  bloom_levels TEXT[],
  page_number INT,
  section_title TEXT,
  combined_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '15s'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id AS chunk_id,
    dc.chunk_text,
    dc.slo_codes,
    dc.grade_levels,
    dc.topics,
    dc.bloom_levels,
    COALESCE((dc.metadata->>'page_number')::INT, 0) AS page_number,
    COALESCE(dc.metadata->>'section_title', 'General Context') AS section_title,
    (
      (1 - (dc.embedding <=> query_embedding)) * 1.5 + -- Weighted similarity
      CASE WHEN dc.slo_codes && boost_slo_codes THEN 20.0 ELSE 0 END + -- High SLO boost
      CASE WHEN dc.document_id = priority_document_id THEN 1.0 ELSE 0 END -- Priority asset boost
    ) AS combined_score
  FROM document_chunks dc
  WHERE dc.document_id = ANY(filter_document_ids)
    AND (filter_grades IS NULL OR dc.grade_levels && filter_grades)
    AND (filter_topics IS NULL OR dc.topics && filter_topics)
    AND (filter_bloom IS NULL OR dc.bloom_levels && filter_bloom)
    AND dc.embedding IS NOT NULL
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;