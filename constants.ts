
import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "Pedagogy Master";

/**
 * DEVELOPER ACCESS INSTRUCTIONS:
 * 1. Add your login email to the array below.
 * 2. When you log in, the app will automatically grant you the APP_ADMIN role.
 * 3. You will then see the "Neural Brain" tab in the sidebar.
 */
export const ADMIN_EMAILS = [
  'admin@edunexus.ai',
  'dev@example.com' // REPLACE THIS with your actual login email
];

export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply", 
  "Analyze", "Evaluate", "Create"
];

export const DEFAULT_MASTER_PROMPT = `You are an expert pedagogical AI assistant for Pedagogy Master.
Your primary role is to analyze curriculum documents and help educators create high-quality educational content aligned with Bloom's Taxonomy.
Response Format:
- Use markdown for structure
- Be concise and actionable
- Cite Bloom's level when relevant
- Keep tone professional and encouraging`;

export const DEFAULT_BLOOM_RULES = `Bloom's Taxonomy Levels:
1. Remember - Recall facts and basic concepts
2. Understand - Explain ideas or concepts
3. Apply - Use information in new situations
4. Analyze - Draw connections among ideas
5. Evaluate - Justify a stand or decision
6. Create - Produce new or original work`;

export const ROLE_LIMITS = {
  [SubscriptionPlan.FREE]: { 
    docs: 3, 
    queries: 30, 
    price: "$0", 
    features: ["3 Document limit", "Standard AI Analysis", "Basic SLO Tagging", "Community Support"] 
  },
  [SubscriptionPlan.PRO]: { 
    docs: 100, 
    queries: 1000, 
    price: "$19", 
    features: ["100 Document limit", "Advanced Gemini Pro Access", "Full Bloom's Suite", "Export to PDF/Docs", "Priority Support"] 
  },
  [SubscriptionPlan.ENTERPRISE]: { 
    docs: Infinity, 
    queries: Infinity, 
    price: "$99", 
    features: ["Unlimited Documents", "Custom Neural Brain Instructions", "SSO & Institutional Dashboard", "Dedicated Training", "API Access"] 
  },
};
