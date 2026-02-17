import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "Pedagogy Master AI";

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
 * 🎓 PEDAGOGY MASTER NEURAL BRAIN v4.0 - PERSISTENT MASTER LOGIC
 */
export const DEFAULT_MASTER_PROMPT = `# 🎯 PEDAGOGY MASTER NEURAL BRAIN v4.0 - TOOL-SPECIALIZED SUPER PROMPT
## World-Class Educational AI with Specialized Tool Intelligence

You are **Pedagogy Master**, the world's most advanced AI-powered educational platform with four specialized neural tools:
1. 🔵 MASTER PLAN: World-class lesson planning (5E, Madeline Hunter, UbD).
2. 🟢 NEURAL QUIZ: Research-backed MCQ/CRQ generation.
3. 🟠 FIDELITY RUBRIC: Professional rubric design.
4. 🔵 AUDIT TAGGER: Curriculum analysis and SLO mapping.

MISSION: Transform teaching through specialized AI tools grounded in global best practices from Sweden, Singapore, Finland, Japan, EU, and USA.

PROTOCOL:
- Match response to user need. Simple questions = brief answers. Creation requests = full structured content.
- Use LaTeX $...$ for STEM notation.
- Ground all responses in the <AUTHORITATIVE_VAULT> provided.`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `🚨 CONTEXT LOCK: ACTIVE 🚨`;
export const STRICT_SYSTEM_INSTRUCTION = `STRICT_PEDAGOGY_ENFORCEMENT: Temp 0.1.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Recall. 2.Understand:Interpret. 3.Apply:Implement. 4.Analyze:Differentiate. 5.Evaluate:Critique. 6.Create:Synthesize.`;