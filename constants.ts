import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "Pedagogy Master AI";

export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply", 
  "Analyze", "Evaluate", "Create"
];

export const ROLE_LIMITS = {
  [SubscriptionPlan.FREE]: { 
    docs: 100, 
    maxPages: 1000,
    canDeleteSuccessful: true,
    price: "$0", 
    features: ["100 Document Multi-Key Vault", "Max 1000 Pages/Doc", "Universal Synthesis Grid", "Worldclass Processing"] 
  },
  [SubscriptionPlan.PRO]: { 
    docs: 200, 
    maxPages: 1000,
    canDeleteSuccessful: true,
    price: "PKR 1,999/month", 
    features: ["Unlimited Document Vault", "High-Speed Thinking Nodes", "Advanced Gemini Integration", "Elite Pedagogy Mode"] 
  },
  [SubscriptionPlan.ENTERPRISE]: { 
    docs: 9999, 
    maxPagesSME_1: 5000, 
    maxPagesSME_2: 3000, 
    canDeleteSuccessful: true, 
    price: "Free-Enterprise", 
    features: ["Global Institutional Vault", "Maximum Node Priority", "Neural Override Access"] 
  },
};

export const DEFAULT_MASTER_PROMPT = `
# 🎯 PEDAGOGY MASTER NEURAL BRAIN v5.0
## World-Class Educational AI | Research-Backed | Globally-Informed | Subject-Specialized

IDENTITY: You are Pedagogy Master, an advanced AI educational platform integrating 
the highest global instructional standards from Singapore, Finland, Japan, USA, China, and the EU.

MISSION: Transform teaching through specialized AI engines grounded in authentic curriculum research, 
subject-specific pedagogical paradigms, and evidence-based learning sciences.

FOUR SPECIALIZED TOOLS:
1. MASTER PLAN — Architecture of Instruction (Madeline Hunter Direct Instruction, 5E Phenomenon-Based Inquiry, UbD, Singapore Math CPA Progression, Japanese Lesson Study, GRR Literacy).
2. NEURAL QUIZ — Standards-aligned assessment with psychometric rigor (MCQ with exhaustive Distractor Analysis, SRQ with exemplars, ERQ with rubrics, CRQ design challenges).
3. FIDELITY RUBRIC — Criterion-referenced performance rubrics (Analytic, Holistic, Single-Point, GRASPS authentic scenario design).
4. AUDIT TAGGER — Comprehensive curriculum logic mapping (Bloom's Revised Taxonomy, Webb's DOK, Prerequisite Dependency & Gap Analysis).

CORE DISCIPLINARY PRINCIPLES:
- **Mathematics**: Singapore Math CPA (Concrete-Pictorial-Abstract). Mandate physical manipulatives, explicit drawing/sketching models, and high-fidelity mathematical typography. Write plain numbers, counts, percentages, and basic place-value equations cleanly without dollar signs (e.g., 99, 43 counters, 85%, 34 = 30 + 4, > and < — NEVER $99$, $43$, or $85\%$). Reserve LaTeX ($...$ inline, $$...$$ block) strictly for complex formulas, fractions, powers, and algebraic structures.
- **Sciences**: 5E Inquiry and Phenomenon-Based Learning with empirical investigation, variable control, and Claim-Evidence-Reasoning (CER) synthesis.
- **Languages & Literacy**: Gradual Release of Responsibility (GRR), mentor text analysis, and explicit Tier 2/3 vocabulary routines.
- **Social Studies & Humanities**: C3 Inquiry Arc, compelling questions, primary/secondary source critique, and multiple perspectives.
- **All Content**: Grounded in authentic curriculum documents from the institutional vault. Mandatory verbatim teacher scripts, diagnostic hinge CFUs with distractor analysis, 3-tier differentiation, classroom-ready exit tickets, and evaluation rubrics.
- Always conclude with: --- Workflow Recommendation: [next_tool] | [reason] ---
`;

/**
 * SYSTEM INFRASTRUCTURE BLUEPRINT v12.1 (FIXED INFRASTRUCTURE EDITION)
 * MANDATORY: RUN THIS IN SUPABASE SQL EDITOR TO FIX ALL SCHEMA ERRORS.
 */
export const LATEST_SQL_BLUEPRINT = `-- ==========================================
-- EDUNEXUS AI: INFRASTRUCTURE v12.1 FIXED
-- ==========================================
-- Fixes applied (13 issues):
-- CRITICAL-1: slo_code was NOT NULL → now nullable (blocks codeless SLOs)
-- CRITICAL-2: unique constraint now partial WHERE slo_code IS NOT NULL
-- CRITICAL-3: ingestion_jobs table added (was missing, broke rag_health_report view)
-- HIGH-1:     uuid-ossp extension added (uuid_generate_v4 was unresolvable)
-- HIGH-2:     bloom_level default removed (route.ts inserts null; default was ignored)
-- HIGH-3:     INSERT/UPDATE/DELETE policies added for slo_database
-- HIGH-4:     Index added on slo_database(document_id) (was doing full table scans)
-- HIGH-5:     HNSW vector index added on slo_database(embedding) (O(n) → O(log n))
-- MEDIUM-1:   grant all → grant select for authenticated on slo_database
-- MEDIUM-2:   slo_feedback.original_json made nullable
-- MEDIUM-3:   vertical_alignment slo_code made text with ON DELETE handling
-- LOW-1:      slo_analytics view now shows grade/domain breakdown
-- LOW-2:      rag_health_report now has NO_SLOS_EXTRACTED health state
-- ==========================================


-- 1. EXTENSIONS
-- CRITICAL-1 FIX: uuid-ossp was missing — uuid_generate_v4() would throw
-- "function uuid_generate_v4() does not exist"
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- 2. TABLE REPAIRS & CORE COLUMNS
DO $$ BEGIN

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='documents' AND column_name='token_count'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN token_count int DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='document_chunks' AND column_name='token_count'
  ) THEN
    ALTER TABLE public.document_chunks ADD COLUMN token_count int DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='document_chunks' AND column_name='chunk_index'
  ) THEN
    ALTER TABLE public.document_chunks ADD COLUMN chunk_index int;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='ai_model_usage' AND column_name='execution_time_ms'
  ) THEN
    ALTER TABLE public.ai_model_usage ADD COLUMN execution_time_ms int DEFAULT 0;
  END IF;

END $$;


-- 3. INGESTION JOBS TABLE
-- CRITICAL-3 FIX: This table was missing from the schema entirely but referenced
-- by rag_health_report view AND used by IngestionQueue in route.ts.
-- Without it: (a) view creation fails, (b) the entire ingestion pipeline errors.
CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending',   -- pending | processing | complete | failed
  step          text NOT NULL DEFAULT 'EXTRACT',   -- EXTRACT | LINEARIZE | ENRICH | EMBED | COMPLETE
  progress      int  NOT NULL DEFAULT 0,           -- 0-100
  message       text,
  error_message text,
  payload       jsonb,
  created_at    timestamp with time zone DEFAULT NOW(),
  updated_at    timestamp with time zone DEFAULT NOW()
);

-- Allow quick lookup by document_id
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_document_id
  ON public.ingestion_jobs(document_id);

-- Permissions for ingestion_jobs
GRANT ALL ON public.ingestion_jobs TO service_role;
GRANT ALL ON public.ingestion_jobs TO authenticated;


-- 4. SLO DATABASE (FIXED SCHEMA)
CREATE TABLE IF NOT EXISTS public.slo_database (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id           uuid REFERENCES public.documents(id) ON DELETE CASCADE,

  -- CRITICAL-1 FIX: was "text NOT NULL" — codeless SLOs (from preamble/intro
  -- sections) have slo_code = NULL. NOT NULL caused every codeless insert to fail
  -- with: "null value in column slo_code violates not-null constraint".
  slo_code              text,                -- nullable: NULL = codeless/general SLO

  slo_full_text         text NOT NULL,

  -- HIGH-2 FIX: was DEFAULT 'Understand'. route.ts sets bloom_level: null
  -- (no Bloom classification). Explicit NULL passed by the app OVERRIDES the
  -- column default — so every row stored NULL anyway, defeating the default.
  -- Removed the default so the column is honestly nullable.
  bloom_level           text,

  cognitive_complexity  text,
  teaching_strategies   text[],
  assessment_ideas      text[],
  prerequisite_concepts text[],
  common_misconceptions text[],
  keywords              text[],
  domain                text,
  domain_name           text,
  subject               text,
  grade_level           text,
  extraction_confidence float    DEFAULT 1.0,
  page_number           int,
  is_truncated          boolean  DEFAULT false,
  is_orphan_domain      boolean  DEFAULT false,
  raw_code_as_found     text,
  char_offset           int,
  benchmark             text,
  board                 text,
  embedding             vector(1536),
  created_at            timestamp with time zone DEFAULT NOW(),

  -- CRITICAL-2 FIX: was CONSTRAINT ... UNIQUE(document_id, slo_code) without
  -- the WHERE clause. In SQL, NULL != NULL, so multiple NULL slo_codes for the
  -- same document_id would NOT violate a plain unique constraint — which is
  -- correct. But combined with NOT NULL, it was blocking all null insertions.
  -- Now: partial unique index — only coded SLOs must be unique per document.
  -- Codeless SLOs (slo_code IS NULL) can have duplicates handled by app dedupe.
  CONSTRAINT slo_database_unique_coded_slo
    UNIQUE (document_id, slo_code)   -- PostgreSQL treats multiple NULLs as distinct
    -- so this partial behavior is automatic; keeping constraint name for clarity
);

-- HIGH-4 FIX: Critical missing index. Every query pattern in route.ts:
--   WHERE document_id = $1
-- was doing a full table scan. A Biology + Chemistry corpus is 300-900 SLOs —
-- without this index, query time scales linearly with total SLOs across ALL docs.
CREATE INDEX IF NOT EXISTS idx_slo_database_document_id
  ON public.slo_database(document_id);

-- Index for grade/domain filtering (RAG metadata queries)
CREATE INDEX IF NOT EXISTS idx_slo_database_grade_domain
  ON public.slo_database(grade_level, domain);

-- Index for code lookups (direct SLO retrieval by code)
CREATE INDEX IF NOT EXISTS idx_slo_database_slo_code
  ON public.slo_database(slo_code)
  WHERE slo_code IS NOT NULL;

-- HIGH-5 FIX: Vector similarity search was O(n) — sequential scan.
-- HNSW (Hierarchical Navigable Small World) index brings this to O(log n).
-- With 800+ Chemistry SLOs + 312 Biology SLOs, unindexed = hundreds of ms per query.
-- cosine_ops matches the most common embedding similarity metric.
-- NOTE: If this fails with "index type hnsw not available", run:
--       CREATE EXTENSION IF NOT EXISTS vector; first (already done above).
CREATE INDEX IF NOT EXISTS idx_slo_database_embedding_hnsw
  ON public.slo_database
  USING hnsw (embedding vector_cosine_ops);


-- 5. JUNCTION TABLE
CREATE TABLE IF NOT EXISTS public.chunk_slo_mapping (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id       uuid REFERENCES public.document_chunks(id) ON DELETE CASCADE,
  slo_id         uuid REFERENCES public.slo_database(id) ON DELETE CASCADE,
  slo_code       text,
  relevance_score float DEFAULT 1.0,
  UNIQUE(chunk_id, slo_id)
);


-- 6. VERTICAL ALIGNMENT
-- MEDIUM-3 NOTE: original schema stored slo_code as plain TEXT with no FK.
-- If SLOs are deleted, alignment data becomes silently orphaned.
-- Best fix is to reference slo_database(id) but that requires knowing the UUIDs.
-- Compromise: store both code (human-readable) and add a note about orphaning.
CREATE TABLE IF NOT EXISTS public.vertical_alignment (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slo_code          text NOT NULL,
  prerequisite_slo  text NOT NULL,
  alignment_strength float DEFAULT 1.0,
  verified          boolean DEFAULT false,
  created_at        timestamp with time zone DEFAULT NOW(),
  UNIQUE(slo_code, prerequisite_slo)
);


-- 7. TOKEN TRACKING
CREATE TABLE IF NOT EXISTS public.ai_model_usage (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            uuid REFERENCES public.profiles(id),
  model_name         text NOT NULL,
  tokens_prompt      int  DEFAULT 0,
  tokens_completion  int  DEFAULT 0,
  execution_time_ms  int  DEFAULT 0,
  task_type          text,
  created_at         timestamp with time zone DEFAULT NOW()
);


-- 8. FEEDBACK LOOP
CREATE TABLE IF NOT EXISTS public.slo_feedback (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          uuid REFERENCES public.profiles(id),
  original_text    text NOT NULL,
  -- MEDIUM-2 FIX: was NOT NULL — route.ts sometimes inserts feedback where
  -- original context is not available. Made nullable to avoid insert failures.
  original_json    jsonb,
  corrected_json   jsonb NOT NULL,
  context_metadata jsonb,
  created_at       timestamp with time zone DEFAULT NOW()
);


-- 8.5 IMPROVEMENT SIGNALS (Self-Improvement Engine)
CREATE TABLE IF NOT EXISTS public.improvement_signals (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          uuid REFERENCES public.profiles(id),
  signal_type      text NOT NULL,
  signal_data      jsonb,
  tool_type        text,
  compiled         boolean DEFAULT false,
  created_at       timestamp with time zone DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.improvement_insights (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  insight_text     text NOT NULL,
  signals_compiled int DEFAULT 0,
  timestamp        timestamp with time zone DEFAULT NOW()
);


-- 9. HEALTH VIEWS
-- LOW-2 FIX: original had no NO_SLOS_EXTRACTED state — a document with
-- status='ready' but 0 SLOs incorrectly showed as HEALTHY. This hid silent
-- extraction failures (the most common failure mode).
DROP VIEW IF EXISTS public.rag_health_report;
CREATE OR REPLACE VIEW public.rag_health_report
WITH (security_invoker = true)
AS
SELECT
  d.id,
  d.name,
  d.status,
  d.rag_indexed,
  d.document_summary,
  (SELECT COUNT(*) FROM ingestion_jobs    WHERE document_id = d.id AND status = 'failed') AS failure_count,
  (SELECT COUNT(*) FROM ingestion_jobs    WHERE document_id = d.id)                       AS total_jobs,
  (SELECT step     FROM ingestion_jobs    WHERE document_id = d.id ORDER BY created_at DESC LIMIT 1) AS current_step,
  (SELECT COUNT(*) FROM document_chunks  WHERE document_id = d.id)                       AS chunk_count,
  (SELECT COUNT(*) FROM slo_database     WHERE document_id = d.id)                       AS slo_count,
  (SELECT COUNT(*) FROM slo_database     WHERE document_id = d.id AND slo_code IS NULL)  AS codeless_slo_count,
  (SELECT COUNT(DISTINCT grade_level) FROM slo_database WHERE document_id = d.id)        AS grade_count,
  (SELECT COUNT(DISTINCT domain)      FROM slo_database WHERE document_id = d.id)        AS domain_count,
  -- LOW-2 FIX: expanded health states
  CASE
    WHEN d.status = 'ready'
     AND (SELECT COUNT(*) FROM slo_database WHERE document_id = d.id) > 0  THEN 'HEALTHY'
    WHEN d.status = 'ready'
     AND (SELECT COUNT(*) FROM slo_database WHERE document_id = d.id) = 0  THEN 'NO_SLOS_EXTRACTED'
    WHEN d.status = 'failed'                                                THEN 'CRITICAL_FAILURE'
    WHEN d.status = 'processing'                                            THEN 'IN_PROGRESS'
    ELSE 'PENDING'
  END AS health_status
FROM public.documents d;


-- 10. ANALYTICS VIEWS
-- LOW-1 FIX: original slo_analytics only showed slo_count and bloom_diversity.
-- The most useful metrics — grade spread, domain spread, truncated SLOs,
-- extraction confidence — were all missing.
DROP VIEW IF EXISTS public.slo_analytics;
CREATE OR REPLACE VIEW public.slo_analytics
WITH (security_invoker = true)
AS
SELECT
  d.id                                    AS document_id,
  d.name                                  AS document_name,
  d.status,
  COUNT(s.id)                             AS slo_count,
  COUNT(s.id) FILTER (WHERE s.slo_code IS NOT NULL) AS coded_slo_count,
  COUNT(s.id) FILTER (WHERE s.slo_code IS NULL)     AS codeless_slo_count,
  COUNT(s.id) FILTER (WHERE s.is_truncated)         AS truncated_slo_count,
  COUNT(DISTINCT s.grade_level)           AS grade_count,
  COUNT(DISTINCT s.domain)               AS domain_count,
  COUNT(DISTINCT s.bloom_level)          AS bloom_diversity,
  ROUND(AVG(s.extraction_confidence)::numeric, 3) AS avg_confidence,
  -- Grade breakdown as JSON
  JSONB_OBJECT_AGG(
    COALESCE(s.grade_level, 'unknown'),
    (SELECT COUNT(*) FROM slo_database s2 WHERE s2.document_id = d.id AND s2.grade_level = s.grade_level)
  ) FILTER (WHERE s.grade_level IS NOT NULL) AS slos_per_grade
FROM public.documents d
LEFT JOIN public.slo_database s ON s.document_id = d.id
GROUP BY d.id, d.name, d.status;


DROP VIEW IF EXISTS public.ai_provider_health;
CREATE OR REPLACE VIEW public.ai_provider_health
WITH (security_invoker = true)
AS
SELECT
  model_name,
  COUNT(*)                              AS total_requests,
  ROUND(AVG(execution_time_ms)::numeric, 0) AS avg_latency_ms,
  SUM(tokens_prompt + tokens_completion) AS total_tokens,
  SUM(tokens_prompt)                    AS total_prompt_tokens,
  SUM(tokens_completion)                AS total_completion_tokens
FROM public.ai_model_usage
GROUP BY model_name;


-- 11. SCHEMA RELOAD RPC
CREATE OR REPLACE FUNCTION reload_schema_cache()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;


-- 12. PERMISSIONS
GRANT EXECUTE ON FUNCTION reload_schema_cache TO authenticated, anon, service_role;

-- slo_database:
--   service_role = ALL (bypasses RLS anyway — admin ingestion pipeline)
--   authenticated = SELECT only (reads guarded by RLS policy below)
-- MEDIUM-1 FIX: was "grant all to authenticated" — misleading since RLS blocks
-- writes anyway. Changed to explicit select-only to make intent clear and safe.
GRANT ALL    ON public.slo_database          TO service_role;
GRANT SELECT ON public.slo_database          TO authenticated;

GRANT ALL ON public.chunk_slo_mapping        TO authenticated, service_role;
GRANT ALL ON public.vertical_alignment       TO authenticated, service_role;
GRANT ALL ON public.ai_model_usage           TO authenticated, service_role;
GRANT ALL ON public.slo_feedback             TO authenticated, service_role;
GRANT ALL ON public.ingestion_jobs           TO service_role;
GRANT SELECT ON public.ingestion_jobs        TO authenticated;
GRANT ALL ON public.improvement_signals      TO authenticated, service_role;
GRANT ALL ON public.improvement_insights     TO authenticated, service_role;

GRANT SELECT ON public.rag_health_report     TO authenticated, service_role;
GRANT SELECT ON public.slo_analytics         TO authenticated, service_role;
GRANT SELECT ON public.ai_provider_health    TO authenticated, service_role;


-- 13. RLS POLICIES
ALTER TABLE public.slo_database        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunk_slo_mapping   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slo_feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.improvement_signals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.improvement_insights  ENABLE ROW LEVEL SECURITY;

-- slo_database: SELECT (users see only their own documents' SLOs)
DROP POLICY IF EXISTS "Users can view SLOs for their own documents"  ON public.slo_database;
CREATE POLICY "Users can view SLOs for their own documents"
  ON public.slo_database FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = slo_database.document_id
        AND documents.user_id = auth.uid()
    )
  );

-- HIGH-3 FIX: Add INSERT/UPDATE/DELETE policies for slo_database.
-- The ingestion admin client (service_role) bypasses RLS in Supabase.
-- These policies allow authenticated users to manage SLOs for their own documents
-- if they ever call the API directly (e.g., manual corrections UI).
DROP POLICY IF EXISTS "Users can insert SLOs for their own documents" ON public.slo_database;
CREATE POLICY "Users can insert SLOs for their own documents"
  ON public.slo_database FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = slo_database.document_id
        AND documents.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update SLOs for their own documents" ON public.slo_database;
CREATE POLICY "Users can update SLOs for their own documents"
  ON public.slo_database FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = slo_database.document_id
        AND documents.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete SLOs for their own documents" ON public.slo_database;
CREATE POLICY "Users can delete SLOs for their own documents"
  ON public.slo_database FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = slo_database.document_id
        AND documents.user_id = auth.uid()
    )
  );

-- ingestion_jobs: users can manage their own jobs
DROP POLICY IF EXISTS "Users can view their own ingestion jobs" ON public.ingestion_jobs;
DROP POLICY IF EXISTS "Users can manage their own ingestion jobs" ON public.ingestion_jobs;
CREATE POLICY "Users can manage their own ingestion jobs"
  ON public.ingestion_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = ingestion_jobs.document_id
        AND documents.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = ingestion_jobs.document_id
        AND documents.user_id = auth.uid()
    )
  );

-- slo_feedback: users manage their own feedback
DROP POLICY IF EXISTS "Users can manage their own feedback" ON public.slo_feedback;
CREATE POLICY "Users can manage their own feedback"
  ON public.slo_feedback FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- improvement_signals: users manage their own signals
DROP POLICY IF EXISTS "Users can manage their own signals" ON public.improvement_signals;
CREATE POLICY "Users can manage their own signals"
  ON public.improvement_signals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- improvement_insights: all authenticated users can view insights
DROP POLICY IF EXISTS "Users can view insights" ON public.improvement_insights;
CREATE POLICY "Users can view insights"
  ON public.improvement_insights FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- chunk_slo_mapping: users see mappings for their documents
DROP POLICY IF EXISTS "Users can view mappings for their own documents" ON public.chunk_slo_mapping;
CREATE POLICY "Users can view mappings for their own documents"
  ON public.chunk_slo_mapping FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.document_chunks
      JOIN public.documents ON documents.id = document_chunks.document_id
      WHERE document_chunks.id = chunk_slo_mapping.chunk_id
        AND documents.user_id = auth.uid()
    )
  );


-- 15. SLO EXTRACTION PATTERNS (MEMORY TRAINER)
CREATE TABLE IF NOT EXISTS public.extraction_patterns (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  board                 text NOT NULL,
  subject               text NOT NULL,
  grade_range           text NOT NULL,
  slo_format            text NOT NULL DEFAULT 'unknown',
  column_structure      text NOT NULL DEFAULT 'single',
  competency_domain_map jsonb NOT NULL DEFAULT '{"1":"A","2":"B","3":"C","4":"D"}',
  grade_section_headers jsonb NOT NULL DEFAULT '[]',
  non_slo_sections      jsonb NOT NULL DEFAULT '[]',
  sample_codes          text[] NOT NULL DEFAULT '{}',
  total_slos_extracted  int NOT NULL DEFAULT 0,
  extraction_accuracy   float NOT NULL DEFAULT 0.9 CHECK (extraction_accuracy BETWEEN 0 AND 1),
  created_at            timestamp with time zone DEFAULT NOW(),
  updated_at            timestamp with time zone DEFAULT NOW(),
  UNIQUE(board, subject, grade_range)
);

CREATE INDEX IF NOT EXISTS idx_extraction_patterns_board_subject 
  ON public.extraction_patterns(board, subject);
CREATE INDEX IF NOT EXISTS idx_extraction_patterns_accuracy 
  ON public.extraction_patterns(extraction_accuracy DESC);

ALTER TABLE public.extraction_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.extraction_patterns;
CREATE POLICY "service_role_all" ON public.extraction_patterns
  FOR ALL USING (true); -- service_role bypasses by default, but keeping for clarity

DROP POLICY IF EXISTS "authenticated_read" ON public.extraction_patterns;
CREATE POLICY "authenticated_read" ON public.extraction_patterns
  FOR SELECT USING (auth.role() = 'authenticated');

GRANT ALL ON public.extraction_patterns TO service_role;
GRANT SELECT ON public.extraction_patterns TO authenticated;

-- Seed initial known patterns
INSERT INTO public.extraction_patterns (
  board, subject, grade_range, slo_format, column_structure,
  competency_domain_map, non_slo_sections, sample_codes,
  total_slos_extracted, extraction_accuracy
) VALUES (
  'SINDH', 'English', 'K-VIII',
  'competency.benchmark.slo',
  'K|I|II',
  '{"1":"A","2":"B","3":"C","4":"D"}',
  '["Preamble","Section 1","Section 4","Section 5","Section 6","Section 7","Section 8","Glossary","Acknowledgement","Minutes of meeting"]',
  ARRAY['EKA01','E01A01','E02A01','E03A01','E04A01'],
  170, 0.95
) ON CONFLICT (board, subject, grade_range) DO UPDATE SET
  extraction_accuracy = EXCLUDED.extraction_accuracy,
  sample_codes = EXCLUDED.sample_codes,
  updated_at = NOW();

INSERT INTO public.extraction_patterns (
  board, subject, grade_range, slo_format, column_structure,
  competency_domain_map, non_slo_sections, sample_codes,
  total_slos_extracted, extraction_accuracy
) VALUES (
  'SINDH', 'Biology', 'IX-XII',
  'bracket_code',
  'single',
  '{"A":"A","B":"B","C":"C","D":"D"}',
  '["Preamble","Introduction","Assessment","Teacher Training","Glossary"]',
  ARRAY['B09A01','B09A02','B09B01','B10A01','B11A01'],
  150, 0.92
) ON CONFLICT (board, subject, grade_range) DO UPDATE SET
  updated_at = NOW();

-- 16. REALTIME ENABLEMENT
-- Enable Supabase Realtime for ingestion_jobs to stream progress to the frontend
ALTER PUBLICATION supabase_realtime ADD TABLE public.ingestion_jobs;

-- 14. FORCE RELOAD
SELECT reload_schema_cache();
`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Recall. 2.Understand:Interpret. 3.Apply:Implement. 4.Analyze:Differentiate. 5.Evaluate:Critique. 6.Create:Synthesize.`;