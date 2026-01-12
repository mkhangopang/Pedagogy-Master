
import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "Pedagogy Master";

export const ADMIN_EMAILS = [
  'mkgopang@gmail.com',
  'admin@edunexus.ai',
  'fasi.2001@live.com'
];

export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply", 
  "Analyze", "Evaluate", "Create"
];

export const ROLE_LIMITS = {
  [SubscriptionPlan.FREE]: { 
    docs: 2, 
    queries: 20, 
    price: "$0", 
    features: ["2 Document Limit", "Standard AI", "Basic SLO Tagging"] 
  },
  [SubscriptionPlan.PRO]: { 
    docs: 100, 
    queries: 1000, 
    price: "$19", 
    features: ["100 Document limit", "Advanced Gemini Engine", "Full Export Suite"] 
  },
  [SubscriptionPlan.ENTERPRISE]: { 
    docs: Infinity, 
    queries: Infinity, 
    price: "Custom", 
    features: ["Unlimited Documents", "Custom Neural Brain", "SSO Access"] 
  },
};

/**
 * CORE OPERATIONAL DIRECTIVES (The App's "DNA")
 * Synchronized with Pedagogy Master AI Studio Instructions.
 */
export const NUCLEAR_GROUNDING_DIRECTIVE = `
🚨 MANDATORY: PEDAGOGY MASTER CORE DIRECTIVE - ABSOLUTE GROUNDING 🚨

YOU ARE PEDAGOGY MASTER. YOUR ONLY SOURCE OF TRUTH IS THE <ASSET_VAULT>.

STRICT RULES:
1. **ZERO EXTERNAL KNOWLEDGE**: Never use general training data if documents are selected.
2. **SLO-FIRST APPROACH**: If a user mentions a code like S8A5, M7B3, or E10A2, locate it in the vault and align 100% of the response to that exact objective.
3. **STRICT ASSET RETRIEVAL**: If information is missing from the vault, explicitly state: "DATA_UNAVAILABLE: This info is not found in your uploaded curriculum documents."
4. **NO ACCESS DENIALS**: Do not claim you lack access to files.
5. **CITE SOURCES**: Refer to documents by name (e.g., "[Ref: FILENAME]").
6. **FORMATTING**: Use 1. and 1.1. headings. NO BOLD HEADINGS.
`;

export const STRICT_SYSTEM_INSTRUCTION = `STRICT_CURRICULUM_GROUNDING: Use ONLY the <ASSET_VAULT>. Identity: Pedagogy Master. Focus: SLO Alignment. Temp 0.0. If missing, say DATA_UNAVAILABLE.`;

/**
 * TOKEN OPTIMIZED MASTER PROMPT
 */
export const DEFAULT_MASTER_PROMPT = `Act as Pedagogy Master, an expert instructional designer. 
Output format: Use 1. and 1.1. for headings. DO NOT USE BOLD (**) FOR HEADINGS.
Style: Professional, educator-focused, precise.
Focus: Precise SLO alignment [S8A5].
[SUGGESTIONS] Option 1 | Option 2`;

export const DEFAULT_BLOOM_RULES = `1.Remember:Define. 2.Understand:Explain. 3.Apply:Solve. 4.Analyze:Contrast. 5.Evaluate:Justify. 6.Create:Design.`;
