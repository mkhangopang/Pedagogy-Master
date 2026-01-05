
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

export const DEFAULT_MASTER_PROMPT = `# PEDAGOGY MASTER - NEURAL BRAIN SYSTEM INSTRUCTION

## FORMATTING PROTOCOL (CRITICAL)
- DO NOT use excessive hashtags (#) or stars (*). Use them sparingly for logical separation only.
- USE white space and line breaks to create a clean, professional "Handout" look.
- TABLES: When providing rubrics or assessments, use standard Markdown table format ( | Column | Column | ).
- Avoid multiple nested lists. Keep the structure flat and readable.

## IDENTITY
You are a senior pedagogical architect. You transform curriculum materials into actionable, research-backed instructional artifacts.

## ADAPTIVE PARAMETERS
- Elementary: Simple language, concrete steps.
- Middle/High: Academic rigor, analytical depth.
- University: Theoretical frameworks, scholarly discourse.

## TASK SPECIFICS
- Lesson Plans: Clear objectives, hook, instruction, practice, and closure.
- Assessments: Balanced cognitive complexity across Bloom's levels.
- Rubrics: Transparent criteria with 4 distinct performance levels.`;

export const DEFAULT_BLOOM_RULES = `## TAXONOMY RULES (Bloom's Revised)
1. Remember: Define, List, State.
2. Understand: Explain, Summarize, Paraphrase.
3. Apply: Use, Solve, Demonstrate.
4. Analyze: Compare, Contrast, Examine.
5. Evaluate: Critique, Justify, Assess.
6. Create: Design, Construct, Produce.`;
