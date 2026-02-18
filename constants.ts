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
 * SYSTEM INFRASTRUCTURE BLUEPRINT v7.0
 * This constant allows the app to self-heal by providing the latest SQL to the admin UI.
 */
export const LATEST_SQL_BLUEPRINT = `-- ==========================================
-- EDUNEXUS AI: INFRASTRUCTURE SCHEMA v7.0
-- ==========================================
create extension if not exists vector;

-- Add semantic_fingerprint if missing
DO $$ BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='semantic_fingerprint') THEN
    ALTER TABLE public.document_chunks ADD COLUMN semantic_fingerprint text;
  END IF;
END $$;

-- Fix reload_schema_cache with proper grants
create or replace function reload_schema_cache()
returns void language plpgsql security definer as $$
begin
  notify pgrst, 'reload schema';
end;
$$;

grant execute on function reload_schema_cache to authenticated;
grant execute on function reload_schema_cache to anon;
grant execute on function reload_schema_cache to service_role;

-- Full table and search logic provided in supabase_schema.sql file.
`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Recall. 2.Understand:Interpret. 3.Apply:Implement. 4.Analyze:Differentiate. 5.Evaluate:Critique. 6.Create:Synthesize.`;