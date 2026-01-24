import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "EduNexus AI";

export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply", 
  "Analyze", "Evaluate", "Create"
];

/**
 * PRODUCTION INFRASTRUCTURE CONSTRAINTS (v88.0)
 * Logic for page ranges and permanent vault anchoring.
 */
export const ROLE_LIMITS = {
  [SubscriptionPlan.FREE]: { 
    docs: 2, 
    maxPages: 20,
    canDelete: false,
    price: "$0", 
    features: ["2 Document Permanent Vault", "Max 20 Pages/Doc", "Standard AI Synthesis"] 
  },
  [SubscriptionPlan.PRO]: { 
    docs: 10, 
    maxPages: 50,
    canDelete: false,
    price: "$19", 
    features: ["10 Document Permanent Vault", "Max 50 Pages/Doc", "Advanced Gemini Engine"] 
  },
  [SubscriptionPlan.ENTERPRISE]: { 
    docs: 200, // SME Tier Logic
    maxPagesSME_1: 500, // For first 100
    maxPagesSME_2: 300, // For remaining 100
    canDelete: true,
    price: "Custom", 
    features: ["200 Document Managed Library", "High-Volume Page Support", "Full Deletion Rights"] 
  },
};

export const DEFAULT_MASTER_PROMPT = `You are the **Pedagogy Master Multi-Agent AI**, a specialized instructional designer. Your mission is to synthesize curriculum-aligned pedagogical tools.

## ABSOLUTE CONTEXT RULE:
- If <AUTHORITATIVE_VAULT> nodes are present, they are the **ONLY SOURCE OF TRUTH** for curriculum standards and SLO codes.
- Use verbatim descriptions and codes from the vault. 

## MANDATORY FALLBACK:
If the vault is empty, state that context is not synced.

## PEDAGOGICAL DNA:
1. 5E INSTRUCTIONAL MODEL
2. BLOOM’S REVISED TAXONOMY
3. UDL`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Define. 2.Understand:Explain. 3.Apply:Solve. 4.Analyze:Compare. 5.Evaluate:Justify. 6.Create:Design.`;