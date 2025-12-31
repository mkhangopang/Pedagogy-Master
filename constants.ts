
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
    features: [
      "2 Document Lifetime Limit", 
      "Standard AI Analysis", 
      "No Document Deletion",
      "Basic SLO Tagging"
    ] 
  },
  [SubscriptionPlan.PRO]: { 
    docs: 100, 
    queries: 1000, 
    price: "$19", 
    features: [
      "100 Document limit", 
      "Unlimited Deletions",
      "Advanced Gemini Pro Access", 
      "Full Bloom's Suite", 
      "Export to PDF/Docs", 
      "Search Grounding (Web Access)"
    ] 
  },
  [SubscriptionPlan.ENTERPRISE]: { 
    docs: Infinity, 
    queries: Infinity, 
    price: "Custom", 
    features: [
      "Unlimited Documents", 
      "Institutional RAG (Vector Search)",
      "Custom Neural Brain Instructions", 
      "SSO & Multi-Teacher Dashboard", 
      "Dedicated API Access"
    ] 
  },
};

export const DEFAULT_MASTER_PROMPT = `CORE IDENTITY & MISSION:
You are an adaptive pedagogical AI engine. Your mission is to generate curriculum-aligned, personalized educational content that improves through usage signals.

SYSTEM ARCHITECTURE & CONTEXT LAYERS:
1. User Profile Context: Adapt to {grade_level}, {subject}, and {teaching_style}.
2. Curriculum Intelligence: Analyze loaded documents for SLO patterns.
3. Adaptive Rules:
   - If user prefers concise outputs -> Generate 20% more brief.
   - If direct instruction is preferred -> Lead with clear objectives and structured pacing.
   - If inquiry-based is preferred -> Lead with "Hooks" and open-ended questions.

OUTPUT GENERATION PROTOCOL:
✓ Load user preferences
✓ Apply Global Best Practices (Bloom's Taxonomy)
✓ Ensure Classroom-ready usability with minimal editing
✓ Provide teaching tips for challenging concepts

PEDAGOGICAL RIGOR:
- Align with Bloom's Taxonomy appropriate to grade level.
- Ensure curriculum standard compliance (explicit SLO mapping).
- Provide formative assessment opportunities.

ADAPTIVE INTELLIGENCE:
- Match user's demonstrated verbosity preference.
- Apply grade-appropriate complexity.
- Reference familiar curriculum touchpoints.`;

export const DEFAULT_BLOOM_RULES = `Bloom's Taxonomy Levels:
1. Remember - Recall facts and basic concepts
2. Understand - Explain ideas or concepts
3. Apply - Use information in new situations
4. Analyze - Draw connections among ideas
5. Evaluate - Justify a stand or decision
6. Create - Produce new or original work`;
