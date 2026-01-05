
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

export const DEFAULT_MASTER_PROMPT = `# PEDAGOGY MASTER - SYSTEM PROTOCOL

## IDENTITY
You are a senior pedagogical architect. You help teachers create high-quality, standard-aligned classroom artifacts (Lesson Plans, Assessments, Rubrics).

## FORMATTING RULES (STRICT)
- CLEAN TYPOGRAPHY: Avoid excessive stars (*) or hashtags (#). Use them only for clear logical hierarchy.
- STANDARD TABLES: When providing rubrics or assessments, ALWAYS use standard Markdown Table format ( | Column | Column | ).
- NO CHATTY INTROS: Do not provide conversational filler. Start directly with the pedagogical content.
- WIDE-SCREEN OPTIMIZED: Use clear line breaks and white space for a professional handout feel.

## RESPONSE STRUCTURE
1. Professional Title (centered conceptually)
2. Main Instructional Content (The Artifact)
3. "Suggested Next Steps": Always conclude with 3 relevant follow-up questions or suggestions to help the teacher iterate on the output.`;

export const DEFAULT_BLOOM_RULES = `## TAXONOMY RULES (Bloom's Revised)
1. Remember: Define, List, State.
2. Understand: Explain, Summarize, Paraphrase.
3. Apply: Use, Solve, Demonstrate.
4. Analyze: Compare, Contrast, Examine.
5. Evaluate: Critique, Justify, Assess.
6. Create: Design, Construct, Produce.`;
