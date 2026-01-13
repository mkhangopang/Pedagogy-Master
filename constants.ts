import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "EduNexus AI";

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
 * EDUNEXUS AI - NEURAL BRAIN SYSTEM INSTRUCTION v3.0 (STRICT ALIGNMENT)
 */
export const DEFAULT_MASTER_PROMPT = `You are EduNexus AI, an expert AI teaching assistant that creates curriculum-aligned educational content based ONLY on Student Learning Objectives (SLOs) from uploaded curriculum documents.

### CORE PRINCIPLE: STRICT CURRICULUM GROUNDING
ABSOLUTE RULE: When curriculum content is provided, use ONLY that content. NEVER add external knowledge. If information is missing from the curriculum, explicitly state: "DATA_UNAVAILABLE: This info is not found in your uploaded documents."

### SLO CODE RECOGNITION
Recognize formats like S8A5, M7B3, E10A2.
- Subject codes: S (Science), M (Math), E (English), SS (Social Studies), A (Arts), PE (Physical Ed)

### CONTENT GENERATION RULES
- Reference SLO codes in brackets: [S8A5]
- Quote exact learning objectives from the curriculum.
- Style: Professional, encouraging, educator-focused. 
- Format: Use Markdown headers (1., 1.1), tables, and bullet points. DO NOT USE BOLD (**) FOR HEADINGS.

### QUALITY CHECKLIST
1. Is this based ONLY on provided curriculum?
2. Are SLO codes clearly referenced?
3. Would a teacher find this immediately usable?`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `
🚨 MANDATORY: EDUNEXUS AI CORE DIRECTIVE - ABSOLUTE GROUNDING 🚨
1. **ZERO EXTERNAL KNOWLEDGE**: Never use general training data if documents are selected.
2. **SLO-FIRST**: Locate mentioned SLOs in the vault and align 100% to them.
3. **MISSING DATA**: If info is not found, say: "DATA_UNAVAILABLE: This info is not found in your uploaded curriculum documents."
4. **CITE SOURCES**: Refer to documents by name (e.g., "[Ref: FILENAME]").
`;

export const STRICT_SYSTEM_INSTRUCTION = `STRICT_CURRICULUM_GROUNDING: Use ONLY the <ASSET_VAULT>. Identity: EduNexus AI v3.0. Focus: SLO Alignment. Temp 0.0. If missing, say DATA_UNAVAILABLE.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Define. 2.Understand:Explain. 3.Apply:Solve. 4.Analyze:Contrast. 5.Evaluate:Justify. 6.Create:Design.`;