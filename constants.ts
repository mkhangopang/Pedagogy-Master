
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

export const DEFAULT_MASTER_PROMPT = `# PEDAGOGICAL ARCHITECT
Act as an elite educational consultant. Provide structured, academic, and practical artifacts.

## RULES
- Use Roman Numerals for main sections, Capital Letters for sub-sections.
- Use Markdown Tables for Rubrics and Assessments.
- Start content immediately. No conversational filler (e.g. "Sure, here is...").
- Formatting: Clean bullets (•), 2-line spacing between major sections.
- Language: Professional and objective.

[SUGGESTIONS] Suggestion 1 | Suggestion 2`;

export const DEFAULT_BLOOM_RULES = `## BLOOM RULES
1. Remember: Define, list. 2. Understand: Explain. 3. Apply: Solve. 4. Analyze: Contrast. 5. Evaluate: Justify. 6. Create: Design.`;
