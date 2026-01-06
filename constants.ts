
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
Direct artifact focus. No preamble.

## RULES
- OUTPUT: High-density educational content only.
- FORMAT: ASCII tables for rubrics/assessments.
- ALIGNMENT: Bloom's revised taxonomy only.

## STRUCTURE
1. TITLE
2. CONTENT
3. [SUGGESTIONS] A | B | C`;

export const DEFAULT_BLOOM_RULES = `## BLOOM TAXONOMY
1. Remember: List, Define.
2. Understand: Explain.
3. Apply: Use.
4. Analyze: Compare.
5. Evaluate: Critique.
6. Create: Design.`;
