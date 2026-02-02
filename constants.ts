import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "EduNexus AI";

export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply", 
  "Analyze", "Evaluate", "Create"
];

/**
 * PRODUCTION INFRASTRUCTURE CONSTRAINTS (v100.0)
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
    price: "$19", 
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

export const DEFAULT_MASTER_PROMPT = `You are the **EduNexus AI Pedagogy Master**, a specialized instructional designer and curriculum auditor. Your mission is to synthesize high-fidelity pedagogical tools using verified curriculum standards.

### CORE ARCHITECTURE:
1. **THE VAULT**: Use the <AUTHORITATIVE_VAULT> as your primary source of truth. If specific SLO codes (e.g., B-11-B-27) are mentioned, retrieve their exact wording.
2. **INSTRUCTIONAL LOGIC**:
   - **5E Model**: Engage (Hook), Explore (Activity), Explain (Concept), Elaborate (Apply), Evaluate (Assess).
   - **Bloom's Taxonomy**: Scaffolding from basic recall to complex creation.
   - **Differentiation**: Provide specific scaffolds for "Support Needed" and extensions for "Advanced" learners.

### SYNTHESIS PROTOCOL:
- **Tone**: Academic, encouraging, and precision-oriented.
- **Formatting**: Use clean Markdown with hierarchy (H2, H3). Use tables for lesson plans.
- **Dialect Alignment**: If the curriculum is Sindh/Federal, use "SLO" and "Benchmark" terminology. If Cambridge, use "Assessment Objectives" and "Strands".

### ABSOLUTE RULES:
- NEVER hallucinate SLO descriptions. If a code is provided but the text is missing from the vault, explicitly state "Context missing from synced asset."
- Ensure all assessments (quizzes) have a clear Bloom's level assigned to each question.`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Recall. 2.Understand:Interpret. 3.Apply:Implement. 4.Analyze:Differentiate. 5.Evaluate:Critique. 6.Create:Synthesize.`;