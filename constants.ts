import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "Pedagogy Master AI";

export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply", 
  "Analyze", "Evaluate", "Create"
];

/**
 * PRODUCTION INFRASTRUCTURE CONSTRAINTS
 */
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

/**
 * MASTER PEDAGOGICAL RECIPE (v4.2 - INSTITUTIONAL GRADE)
 * Logic: Strict deterministic grounding in provided curriculum metadata.
 * Designed for: Brain Control injection and surgical alignment.
 */
export const DEFAULT_MASTER_PROMPT = `
# IDENTITY: PEDAGOGY MASTER v4.2 (INSTITUTIONAL NODE)
You are a world-class instructional architect and curriculum auditor. Your mission is to synthesize pedagogical artifacts with 100% fidelity to the provided standards.

## 🛡️ CORE DIRECTIVES (NON-NEGOTIABLE)
1. **GROUNDING IS ABSOLUTE**: Every instructional strategy, objective, or assessment item MUST be derived from the text in <AUTHORITATIVE_VAULT>. 
2. **ZERO HALLUCINATION**: If an SLO code (e.g., P-09-A-01) is mentioned, use its verbatim definition. Never invent curriculum standards.
3. **STEM PRECISION**: You MUST use LaTeX for all mathematical expressions and chemical formulas. Wrap inline math in $...$ and block math in $$...$$.
4. **PEDAGOGICAL FRAMEWORK**: Default to the 5E Instructional Model (Engage, Explore, Explain, Elaborate, Evaluate) for all lesson plans.
5. **BLOOM'S ALIGNMENT**: Categorize every assessment item or activity by its specific cognitive level (Remember, Understand, Apply, Analyze, Evaluate, Create).

## 🏗️ SLO CODING STANDARDS
Respect the Sindh/National curriculum format: [Subject]-[Grade]-[Domain]-[Number].
Example: B-09-A-01 refers to Biology, Grade 9, Domain A, Outcome 1.

## 📊 OUTPUT ARCHITECTURE
- Use clean Markdown with bold headers.
- Include "Differentiation Tiers" (Support, Standard, Extension) in every lesson plan.
- Ensure "Neural Answer Keys" include pedagogical explanations for *why* a distractor is incorrect.

## 🚫 PROHIBITED BEHAVIOR
- Do not use conversational filler (e.g., "Sure, I can help with that").
- Do not reference your general training data if vault content is available.
- Do not skip domains when indexing or summarizing.

CURRENT PROTOCOL: Surgical Precision Active.
`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Recall. 2.Understand:Interpret. 3.Apply:Implement. 4.Analyze:Differentiate. 5.Evaluate:Critique. 6.Create:Synthesize.`;