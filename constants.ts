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
 * SYSTEM INFRASTRUCTURE BLUEPRINT v7.6
 * Includes mandatory 'slo_database' and 'ingestion_jobs' with explicit permissions.
 */
export const LATEST_SQL_BLUEPRINT = `-- ==========================================
-- EDUNEXUS AI: INFRASTRUCTURE REPAIR v7.6
-- ==========================================

-- 1. Ensure Vector Extension
create extension if not exists vector;

-- 2. FIX: Convert id from UUID to TEXT if necessary for neural_brain
DO $$ 
BEGIN 
    IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'neural_brain' AND column_name = 'id') = 'uuid' THEN
        ALTER TABLE public.neural_brain ALTER COLUMN id TYPE text USING id::text;
    END IF;
END $$;

-- 3. Add semantic_fingerprint if missing
DO $$ BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='semantic_fingerprint') THEN
    ALTER TABLE public.document_chunks ADD COLUMN semantic_fingerprint text;
  END IF;
END $$;

-- 4. Add blueprint_sql to neural_brain if missing
DO $$ BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='neural_brain' AND column_name='blueprint_sql') THEN
    ALTER TABLE public.neural_brain ADD COLUMN blueprint_sql text;
  END IF;
END $$;

-- 5. Create SLO Database
create table if not exists public.slo_database (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents(id) on delete cascade,
  slo_code text not null,
  slo_full_text text not null,
  bloom_level text,
  created_at timestamp with time zone default now()
);

-- 6. Create Retrieval Logs
create table if not exists public.retrieval_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  query_text text,
  top_chunk_ids uuid[],
  confidence_score float,
  latency_ms int,
  provider_used text,
  created_at timestamp with time zone default now()
);

-- 7. Fix reload_schema_cache
create or replace function reload_schema_cache()
returns void language plpgsql security definer as $$
begin
  notify pgrst, 'reload schema';
end;
$$;

-- 8. Ensure Ingestion Jobs table exists
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

-- 9. Permissions Refresh
grant execute on function reload_schema_cache to authenticated, anon, service_role;
grant all on public.slo_database to authenticated, service_role;
grant all on public.ingestion_jobs to authenticated, service_role;
grant all on public.retrieval_logs to authenticated, service_role;
`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Recall. 2.Understand:Interpret. 3.Apply:Implement. 4.Analyze:Differentiate. 5.Evaluate:Critique. 6.Create:Synthesize.`;