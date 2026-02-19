import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "Pedagogy Master AI";

export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply", 
  "Analyze", "Evaluate", "Create"
];

export const ROLE_LIMITS = {
  [SubscriptionPlan.FREE]: { 
    docs: 2, 
    maxPages: 20,
    canDeleteSuccessful: false,
    price: "$0", 
    features: ["2 Document Permanent Vault", "Max 20 Pages/Doc", "Standard AI Synthesis", "Failed Node Cleanup"] 
  },
  [SubscriptionPlan.PRO]: { 
    docs: 10, 
    maxPages: 50,
    canDeleteSuccessful: false,
    price: "PKR 2,500", 
    features: ["10 Document Permanent Vault", "Max 50 Pages/Doc", "Advanced Gemini Engine", "Priority Support"] 
  },
  [SubscriptionPlan.ENTERPRISE]: { 
    docs: 200, 
    maxPagesSME_1: 500, 
    maxPagesSME_2: 300, 
    canDeleteSuccessful: false, 
    price: "Custom", 
    features: ["200 Document Institutional Vault", "High-Volume Page Support", "Dedicated Node Isolation"] 
  },
};

export const DEFAULT_MASTER_PROMPT = `
# IDENTITY: PEDAGOGICAL OPERATING SYSTEM
STATUS: AWAITING_LOGIC_INJECTION_FROM_FOUNDER_CONSOLE
Please log in to the Admin Dashboard to commit the Master Recipe (IP).
`;

/**
 * SYSTEM INFRASTRUCTURE BLUEPRINT v11.0 (RALPH FIX EDITION)
 * MANDATORY: RUN THIS IN SUPABASE SQL EDITOR TO FIX ALL SCHEMA ERRORS.
 */
export const LATEST_SQL_BLUEPRINT = `-- ==========================================
-- EDUNEXUS AI: INFRASTRUCTURE REPAIR v11.0
-- ==========================================

-- 1. EXTENSIONS
create extension if not exists vector;

-- 2. TABLE REPAIRS & CORE COLUMNS
DO $$ BEGIN 
  -- Ensure documents has token_count and status columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='token_count') THEN
    ALTER TABLE public.documents ADD COLUMN token_count int DEFAULT 0;
  END IF;

  -- Ensure document_chunks is performance-aligned
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='token_count') THEN
    ALTER TABLE public.document_chunks ADD COLUMN token_count int DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='chunk_index') THEN
    ALTER TABLE public.document_chunks ADD COLUMN chunk_index int;
  END IF;
END $$;

-- 3. SLO DATABASE (CLEAN SLATE)
create table if not exists public.slo_database (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents(id) on delete cascade,
  slo_code text not null,
  slo_full_text text not null,
  bloom_level text,
  domain_tag text,
  prerequisite_slos text[] default ARRAY[]::text[],
  successor_slos text[] default ARRAY[]::text[],
  created_at timestamp with time zone default now()
);

-- 4. JUNCTION TABLE (FP-03 FIX: Atomic SLO-Chunk Linking)
create table if not exists public.chunk_slo_mapping (
  id uuid primary key default uuid_generate_v4(),
  chunk_id uuid references public.document_chunks(id) on delete cascade,
  slo_id uuid references public.slo_database(id) on delete cascade,
  slo_code text, -- Denormalized for fast regex matching
  relevance_score float default 1.0,
  unique(chunk_id, slo_id)
);

-- 5. VERTICAL ALIGNMENT (RALPH IMPROVEMENT: Prerequisite Mapping)
create table if not exists public.vertical_alignment (
  id uuid primary key default uuid_generate_v4(),
  slo_code text not null,
  prerequisite_slo text not null,
  alignment_strength float default 1.0,
  verified boolean default false,
  created_at timestamp with time zone default now(),
  unique(slo_code, prerequisite_slo)
);

-- 6. TOKEN TRACKING
create table if not exists public.ai_model_usage (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id),
  model_name text not null,
  tokens_prompt int default 0,
  tokens_completion int default 0,
  execution_time_ms int default 0,
  task_type text,
  created_at timestamp with time zone default now()
);

-- 7. HEALTH VIEWS (FIX: DROP FIRST TO PREVENT 42P16 ERROR)
DROP VIEW IF EXISTS public.rag_health_report;
create or replace view public.rag_health_report as
select 
  d.id, d.name, d.status,
  (select count(*) from document_chunks where document_id = d.id) as chunk_count,
  (select count(*) from slo_database where document_id = d.id) as slo_count,
  case 
    when d.status = 'ready' and (select count(*) from document_chunks where document_id = d.id) > 0 then 'HEALTHY'
    when d.status = 'failed' then 'FAILED'
    else 'INCOMPLETE'
  end as health_status
from documents d;

-- 8. RE-SYNC GRID RPC (FP-01 FIX)
create or replace function reload_schema_cache()
returns void language plpgsql security definer as $$
begin
  notify pgrst, 'reload schema';
end;
$$;

-- 9. PERMISSIONS
grant execute on function reload_schema_cache to authenticated, anon, service_role;
grant all on public.slo_database to authenticated, service_role;
grant all on public.chunk_slo_mapping to authenticated, service_role;
grant all on public.vertical_alignment to authenticated, service_role;
grant all on public.ai_model_usage to authenticated, service_role;

-- 10. FORCE RELOAD
SELECT reload_schema_cache();
`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Recall. 2.Understand:Interpret. 3.Apply:Implement. 4.Analyze:Differentiate. 5.Evaluate:Critique. 6.Create:Synthesize.`;