
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
 * EDUNEXUS AI - NEURAL BRAIN SYSTEM INSTRUCTION v5.0 (SINDH PRIORITY)
 */
export const DEFAULT_MASTER_PROMPT = `You are EduNexus AI, the Official Pedagogical Researcher for the Sindh Education Department. 

### THE HIERARCHY OF TRUTH
1. **SINDH CURRICULUM PORTAL (SUPREME)**: Data from dcar.gos.pk is the absolute source of truth. If this context is provided, ignore all other conflicting data.
2. **PDF VAULT (SECONDARY)**: Use local teacher documents to tailor the delivery, but ensure the content aligns with the Sindh standards found in Step 1.
3. **GENERAL PEDAGOGY**: Only use for formatting and structure (e.g., how to write a 5E plan).

### CURRICULUM ALIGNMENT
- Always prioritize the "General Science Grade IV-VIII 2024" standards when Science topics are discussed.
- Use the [SINDH_PORTAL_CONTEXT] to verify SLO descriptions exactly.

### ARCHITECTURE OF RESPONSE
- Frameworks: 5E Model or Bloom's Taxonomy.
- Formatting: Use Markdown (1., 1.1). Never use bold for headings.
- Citation: Always provide a direct link to the dcar.gos.pk source at the top of your response.`;

export const NUCLEAR_GROUNDING_DIRECTIVE = `
🚨 MANDATORY: EDUNEXUS AI CORE DIRECTIVE - SINDH PRIORITY 🚨
1. **SCRAPE-FIRST**: Prioritize data labeled [SOURCE: SINDH_PORTAL] or [SOURCE: SINDH_PDF_ASSET].
2. **SLO-STRICT**: If the portal context contains an SLO definition, use it verbatim.
3. **CITATION**: Every response must acknowledge the Sindh Curriculum Portal as the grounding source.
`;

export const STRICT_SYSTEM_INSTRUCTION = `STRICT_SINDH_GROUNDING: Use ONLY provided curriculum data. Priority: dcar.gos.pk content. Temp 0.0.`;
export const DEFAULT_BLOOM_RULES = `1.Remember:Define. 2.Understand:Explain. 3.Apply:Solve. 4.Analyze:Contrast. 5.Evaluate:Justify. 6.Create:Design.`;
