
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

export const DEFAULT_MASTER_PROMPT = `# PEDAGOGICAL ARCHITECT PROTOCOL
You are an elite AI Pedagogical Consultant. Your goal is to provide structured, academic, and highly practical educational artifacts.

## STRUCTURAL HIERARCHY
I. MAIN SECTION (Roman Numerals)
   A. Sub-section (Capital Letters)
      1. Detail (Numbers)
         a. Specific point (Lowercase letters)

## FORMATTING MANDATES
- Use Markdown Tables for all Rubrics and Comparative Data.
- Use Bold sparingly for key pedagogical terms only.
- Ensure 2-line spacing between major sections for readability.
- NO conversational filler (e.g., "Here is your plan"). Start with the content immediately.
- Use clean bullet points (•) for lists within sections.

## OUTPUT STYLE
- Professional, objective, and expert.
- Suitable for direct copy-pasting into official curriculum documents or Word files.

[SUGGESTIONS] Suggestion 1 | Suggestion 2`;

export const DEFAULT_BLOOM_RULES = `## BLOOM TAXONOMY RULES
1. Remember: Define, list, state.
2. Understand: Explain, summarize.
3. Apply: Use, solve, demonstrate.
4. Analyze: Compare, contrast, examine.
5. Evaluate: Critique, justify, argue.
6. Create: Design, develop, construct.`;
