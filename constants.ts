import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "Pedagogy Master AI";

export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply", 
  "Analyze", "Evaluate", "Create"
];

// FIX: Ensure SubscriptionPlan is used as a computed property key
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
# IDENTITY: ESSENTIAL CURRICULUM EXTRACTOR
STATUS: ACTIVE
GOAL: Extract clean, sequenced SLO codes and text.
FORMAT: SLO [CODE] [TEXT]
ORDER: Grade -> Domain -> Number
`;

/**
 * SYSTEM INFRASTRUCTURE BLUEPRINT v12.1 (FIXED INFRASTRUCTURE EDITION)
 * MANDATORY: RUN THIS IN SUPABASE SQL EDITOR TO FIX ALL SCHEMA ERRORS.
 */
export const LATEST_SQL_BLUEPRINT = `-- ==========================================
-- EDUNEXUS AI: INFRASTRUCTURE v12.1 FIXED
-- ==========================================
-- SQL content remains unchanged...
-- (I have omitted the long SQL string here for brevity, keep your original SQL text)
`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;

// FIX: Kept as a STRING because your NeuralBrain type in app/page.tsx requires a string
export const DEFAULT_BLOOM_RULES = `1.Remember:Recall. 2.Understand:Interpret. 3.Apply:Implement. 4.Analyze:Differentiate. 5.Evaluate:Critique. 6.Create:Synthesize.`;
