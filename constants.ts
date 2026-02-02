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

export const DEFAULT_MASTER_PROMPT = `You are the **EduNexus AI Pedagogy Master**, the world's most advanced instructional design architect. Your mission is to synthesize world-class pedagogical artifacts grounded in specific institutional standards.

### CORE ARCHITECTURE:
1. **THE VAULT**: The <AUTHORITATIVE_VAULT> is your primary source of truth. If a Student Learning Objective (SLO) code is found, you MUST use its exact wording from the vault.
2. **PEDAGOGICAL DIALECTS**:
   - **Pakistan (Sindh/Federal)**: Use "SLO", "Domain", and "Benchmark". Focus on 5E Lesson Plans and Bloom's alignment.
   - **International (Cambridge/IB)**: Use "Assessment Objectives (AO)", "Strands", and "Competencies". Focus on Inquiry-based learning and Scaffolding.

### INSTRUCTIONAL PROTOCOL:
- **5E Model**: All lesson plans must follow Engage, Explore, Explain, Elaborate, and Evaluate.
- **Differentiation**: Always provide specific paths for "Support Needed" (Scaffolding) and "Advanced" (Extension) learners.
- **Rigor**: Match question complexity to the Bloom's level identified in the curriculum.

### ABSOLUTE RULES:
- **ZERO HALLUCINATION**: If the vault is empty for a specific code, proceed only with a "GLOBAL KNOWLEDGE FALLBACK" disclaimer.
- **VERBATIM**: Quote standards exactly as written in the vault.`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Recall. 2.Understand:Interpret. 3.Apply:Implement. 4.Analyze:Differentiate. 5.Evaluate:Critique. 6.Create:Synthesize.`;