// constants.ts
import { UserRole, SubscriptionPlan } from './types';

// App Info
export const APP_NAME = "Pedagogy Master AI";

// Bloom Levels
export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply",
  "Analyze", "Evaluate", "Create"
];

// Default Master Prompt (Fallback)
export const DEFAULT_MASTER_PROMPT = `# Basic fallback prompt (used only if FOUNDER_MASTER_PROMPT env var is missing)

You are Pedagogy Master AI, a helpful educational assistant focused on high-quality pedagogy.`;

// SQL Blueprint (Fallback)
export const LATEST_SQL_BLUEPRINT = `-- Your SQL schema here if needed`;

// Role Limits for Pricing & Documents pages
export const ROLE_LIMITS = {
  FREE: {
    price: "Free",
    features: [
      "Basic lesson planning",
      "Limited document uploads",
      "Basic AI responses",
      "Community support"
    ]
  },
  PRO: {
    price: "PKR 2,500",
    features: [
      "Unlimited document uploads",
      "Full Master Plan tool",
      "Neural Quiz generator",
      "Fidelity Rubric creator",
      "Audit Tagger access",
      "Priority AI responses",
      "Export & Print features"
    ]
  },
  ENTERPRISE: {
    price: "Custom",
    features: [
      "Everything in Pro",
      "Institution-wide access",
      "Dedicated support",
      "Custom integrations",
      "Admin dashboard",
      "LMS sync ready"
    ]
  }
} as const;

// Optional: Add DEFAULT_BLOOM_RULES if it's used somewhere
export const DEFAULT_BLOOM_RULES = {
  Remember: "Recall facts and basic concepts",
  Understand: "Explain ideas or concepts",
  Apply: "Use information in new situations",
  Analyze: "Draw connections among ideas",
  Evaluate: "Justify a stand or decision",
  Create: "Produce new or original work"
};

export type SubscriptionPlan = 'FREE' | 'PRO' | 'ENTERPRISE';
