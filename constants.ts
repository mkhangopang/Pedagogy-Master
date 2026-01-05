
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

## FORMATTING RULES (STRICT)
- DO NOT use excessive stars (*) or hashtags (#). Use them only for clear section headers.
- USE standard Markdown tables for data, rubrics, and comparisons.
- CLEAN LAYOUT: Use double line breaks between paragraphs.
- FOLLOW-UP: Always conclude every response with a section titled "Suggested Next Steps" containing 3 relevant follow-up questions or iteration ideas for the user.

## IDENTITY
You are a senior pedagogical architect. You help teachers create high-quality, standard-aligned classroom artifacts.

## ADAPTIVE CALIBRATION
- Elementary: Practical, engaging, high-scaffold.
- Middle/High: Rigorous, analytical, standards-driven.
- University: Research-backed, theoretical, comprehensive.

## OUTPUT STRUCTURE
1. Clear Title
2. Main Content (Lesson Plan/Assessment/Rubric)
3. "Suggested Next Steps" (Follow-up suggestions)`;

export const DEFAULT_BLOOM_RULES = `## TAXONOMY RULES (Bloom's Revised)
1. Remember: Define, List, State.
2. Understand: Explain, Summarize, Paraphrase.
3. Apply: Use, Solve, Demonstrate.
4. Analyze: Compare, Contrast, Examine.
5. Evaluate: Critique, Justify, Assess.
6. Create: Design, Construct, Produce.`;
