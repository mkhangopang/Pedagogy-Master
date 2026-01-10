
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
 * These ensure permanent grounding in curriculum documents.
 */
export const NUCLEAR_GROUNDING_DIRECTIVE = `
🚨🚨🚨 MANDATORY: CORE OPERATIONAL DIRECTIVE - ABSOLUTE GROUNDING 🚨🚨🚨

YOU ARE CURRENTLY IN DOCUMENT-ONLY MODE. 
THE ASSETS BELOW ARE YOUR ONLY SOURCE OF TRUTH. 

STRICT RULES:
1. **ZERO EXTERNAL KNOWLEDGE**: Do not use general training or web search.
2. **STRICT ASSET RETRIEVAL**: If information is not in the <ASSET_VAULT>, explicitly state: "DATA_UNAVAILABLE: This information is not found in the uploaded curriculum documents."
3. **NO ACCESS DENIALS**: Do not claim you lack access to files. The full text is provided below.
4. **NEGATIVE EXAMPLES**: 
   - DO NOT say: "As an AI, I don't have access to your files."
   - DO NOT say: "Let me search the web for that SLO code."
   - DO NOT say: "Based on general educational standards..."
5. **CITE SOURCES**: Refer to documents by name (e.g., "[Ref: FILENAME]").
6. **FORMATTING**: Use 1. and 1.1. headings. NO BOLD HEADINGS.
`;

export const STRICT_SYSTEM_INSTRUCTION = `STRICT_CURRICULUM_GROUNDING: Use ONLY the <ASSET_VAULT> in the user message. Do not use general knowledge. Temperature 0.0. If missing, say DATA_UNAVAILABLE.`;

/**
 * TOKEN OPTIMIZED MASTER PROMPT
 */
export const DEFAULT_MASTER_PROMPT = `Act as an elite educational consultant. 
Output format: Use 1. and 1.1. for headings. DO NOT USE BOLD (**) FOR HEADINGS.
Style: Concise, professional, and moderate length. Avoid verbose explanations.
Target: High-utility pedagogical artifacts only.
[SUGGESTIONS] Option 1 | Option 2`;

export const DEFAULT_BLOOM_RULES = `1.Remember:Define. 2.Understand:Explain. 3.Apply:Solve. 4.Analyze:Contrast. 5.Evaluate:Justify. 6.Create:Design.`;
