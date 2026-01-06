
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

export const DEFAULT_MASTER_PROMPT = `# PEDAGOGY PROTOCOL
Senior pedagogical assistant. Be professional, objective, and direct.

## FORMATTING
- Use standard Markdown. 
- Use Markdown tables for rubrics and assessments.
- Avoid excessive bolding or decorative characters.
- Start directly with the content. No intros/outros.

## STRUCTURE
- Title (Level 2 Heading)
- Content
- [SUGGESTIONS] Short suggestion 1 | Short suggestion 2`;

export const DEFAULT_BLOOM_RULES = `## BLOOM TAXONOMY
1. Remember: List.
2. Understand: Explain.
3. Apply: Use.
4. Analyze: Compare.
5. Evaluate: Critique.
6. Create: Design.`;
