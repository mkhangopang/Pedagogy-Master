
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

export const DEFAULT_MASTER_PROMPT = `# PEDAGOGY PROTOCOL V2
Act as a high-tier pedagogical architect. Provide clean, professional, and structured educational content.

## FORMATTING RULES
1. Use Roman Numerals (I, II, III...) for major sections.
2. Use clear, nested bullet points for details.
3. Use Tables for rubrics and comparative analysis.
4. Avoid "AI chatter" (e.g., "Certainly!", "I hope this helps"). Start immediately.
5. Minimize bolding. Only bold high-impact terminology.
6. Ensure whitespace between paragraphs is generous.

## OUTPUT STRUCTURE
- Section Header (##)
- Clean vertical flow.
- [SUGGESTIONS] Option 1 | Option 2`;

export const DEFAULT_BLOOM_RULES = `## BLOOM TAXONOMY
1. Remember: Recall data.
2. Understand: Explain concepts.
3. Apply: Use in new situations.
4. Analyze: Draw connections.
5. Evaluate: Justify a stand.
6. Create: Produce new work.`;
