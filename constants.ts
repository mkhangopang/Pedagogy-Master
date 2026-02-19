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
 * SYSTEM INFRASTRUCTURE BLUEPRINT v9.0 (ULTIMATE REPAIR)
 * MANDATORY: RUN THIS IN SUPABASE SQL EDITOR TO FIX ALL SCHEMA ERRORS.
 */
export const LATEST_SQL_BLUEPRINT = `-- ==========================================
-- EDUNEXUS AI: INFRASTRUCTURE REPAIR v9.0
-- ==========================================

-- 1. Ensure Vector Extension
create extension if not exists vector;

-- 2. Repair neural_brain (Fixing id type)
DO $$ 
BEGIN 
    IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'neural_brain' AND column_name = 'id') = 'uuid' THEN
        ALTER TABLE public.neural_brain ALTER COLUMN id TYPE text USING id::text;
    END IF;
END $$;

-- 3. CHUNK TABLE REPAIR (Adding all missing performance columns)
DO $$ BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='semantic_fingerprint') THEN
    ALTER TABLE public.document_chunks ADD COLUMN semantic_fingerprint text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='token_count') THEN
    ALTER TABLE public.document_chunks ADD COLUMN token_count int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='chunk_index') THEN
    ALTER TABLE public.document_chunks ADD COLUMN chunk_index int;
  END IF;
END $$;

-- 4. BRAIN TABLE REPAIR
DO $$ BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='neural_brain' AND column_name='blueprint_sql') THEN
    ALTER TABLE public.neural_brain ADD COLUMN blueprint_sql text;
  END IF;
END $$;

-- 5. Create SLO Database (Crucial for "Sync Interrupted" fix)
create table if not exists public.slo_database (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents(id) on delete cascade,
  slo_code text not null,
  slo_full_text text not null,
  bloom_level text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

-- 6. Ingestion Tracking
create table if not exists public.ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  retry_count int DEFAULT 0,
  error_message text,
  payload jsonb, 
  updated_at timestamp with time zone DEFAULT now()
);

-- 7. RAG Health View (For Audit Dashboard)
create or replace view public.rag_health_report as
select 
  d.id, d.name, d.status,
  (select count(*) from document_chunks where document_id = d.id) as chunk_count,
  (select count(*) from slo_database where document_id = d.id) as slo_count,
  case 
    when d.status = 'ready' and (select count(*) from document_chunks where document_id = d.id) > 0 then 'HEALTHY'
    when d.status = 'ready' then 'BROKEN_EMPTY'
    else 'IN_PROGRESS'
  end as health_status
from documents d;

-- 8. Core Cache Function
create or replace function reload_schema_cache()
returns void language plpgsql security definer as $$
begin
  notify pgrst, 'reload schema';
end;
$$;

-- 9. Ultimate Permission Refresh
grant execute on function reload_schema_cache to authenticated, anon, service_role;
grant all on public.slo_database to authenticated, service_role;
grant all on public.ingestion_jobs to authenticated, service_role;
grant all on public.document_chunks to authenticated, service_role;

-- 10. Execute Cache Clear
SELECT reload_schema_cache();
`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Recall. 2.Understand:Interpret. 3.Apply:Implement. 4.Analyze:Differentiate. 5.Evaluate:Critique. 6.Create:Synthesize.`;