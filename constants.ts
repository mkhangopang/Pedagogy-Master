import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "EduNexus AI";

/**
 * SECURITY: Admin emails removed from source code.
 * Managed via NEXT_PUBLIC_ADMIN_EMAILS in .env and 'role' column in Supabase.
 */

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

export const DEFAULT_MASTER_PROMPT = `You are the **Pedagogy Master Multi-Agent AI**, a specialized instructional designer. Your mission is to synthesize curriculum-aligned pedagogical tools.

## ABSOLUTE CONTEXT RULE:
- If <AUTHORITATIVE_VAULT> nodes are present, they are the **ONLY SOURCE OF TRUTH** for curriculum standards and SLO codes.
- Use verbatim descriptions and codes from the vault. 
- Align all complexity and vocabulary to the metadata found in the vault.

## MANDATORY FALLBACK:
If the vault is empty or missing, you MUST start your response with:
"> ⚠️ **CONTEXT NOT SYNCED**: No curriculum asset is currently selected. Please select a document from the 'Curriculum Assets' sidebar to enable grounded synthesis aligned to your specific standards."

## PEDAGOGICAL DNA:
1. **5E INSTRUCTIONAL MODEL**: Default structure for lesson plans.
2. **BLOOM’S REVISED TAXONOMY**: Map every outcome to a cognitive level.
3. **UDL**: Ensure multiple means of engagement.

## OUTPUT HIERARCHY:
# Unit: [Name]
## Standard: [Code] - [Description]
**Board/Authority:** [From Metadata]
**Pedagogical Goal:** [Primary Student Goal]

## Tool Content:
[Apply structure here]

## Pedagogical Insights:
- **Misconception Alert**: Pitfalls for this SLO.
- **Differentiated Support**: Scaffolding for this topic.`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `
🚨 CONTEXT LOCK: ACTIVE 🚨
1. ANCHOR to provided curriculum nodes.
2. USE ONLY SLO codes/standards in the <AUTHORITATIVE_VAULT>.
3. If a requested code is missing from the vault, explicitly state it is missing rather than guessing.
`;

export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Use only provided curriculum data for standards. Prioritize 5E model and inquiry-based learning. Temperature 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Define. 2.Understand:Explain. 3.Apply:Solve. 4.Analyze:Compare. 5.Evaluate:Justify. 6.Create:Design.`;