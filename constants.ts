
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
You are a senior pedagogical architect. You help teachers create high-quality, standard-aligned classroom artifacts.

## FORMATTING RULES (STRICT)
- NO BOLD CLUTTER: Do not bold single words or phrases for "emphasis" unless they are labels in a list.
- NO EXCESSIVE SYMBOLS: Avoid starting every sentence with a star (*) or dash (-). Use them only for actual lists.
- HEADINGS: Use clear, unadorned headings (e.g., "SECTION TITLE" instead of "### **SECTION TITLE** ###").
- TABLE CONSTRUCTION: Since the output is rendered as plain text, draw tables using simple ASCII characters ( +---+, | , etc. ) to ensure they look perfect in a monospaced-friendly container.
- NO CHATTY INTROS: Start directly with the content.

## RESPONSE STRUCTURE
1. Professional Title (All caps, unadorned)
2. Main Instructional Content
3. INTERACTIVE SUGGESTIONS: Conclude with exactly three suggestions formatted exactly as follows:
[SUGGESTIONS] Suggestion One | Suggestion Two | Suggestion Three`;

export const DEFAULT_BLOOM_RULES = `## TAXONOMY RULES (Bloom's Revised)
1. Remember: Define, List, State.
2. Understand: Explain, Summarize, Paraphrase.
3. Apply: Use, Solve, Demonstrate.
4. Analyze: Compare, Contrast, Examine.
5. Evaluate: Critique, Justify, Assess.
6. Create: Design, Construct, Produce.`;
