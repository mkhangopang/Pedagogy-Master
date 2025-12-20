
import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "Pedagogy Master";

// IMPORTANT: Replace this with your actual email to gain Admin/Developer access
export const ADMIN_EMAILS = [
  'your-email@example.com', 
  // Add other developer emails here
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
    docs: 2, 
    queries: 50, 
    price: "$0", 
    features: ["2 Document limit", "Basic AI Tutor", "Remember/Understand levels", "No deletions allowed"] 
  },
  [SubscriptionPlan.PRO]: { 
    docs: 50, 
    queries: 500, 
    price: "$29", 
    features: ["50 Document limit", "Advanced AI Models", "Full Bloom's Suite", "Export to PDF/Docs", "Priority Support"] 
  },
  [SubscriptionPlan.ENTERPRISE]: { 
    docs: Infinity, 
    queries: Infinity, 
    price: "$199", 
    features: ["Unlimited Documents", "Custom Neural Brain", "LMS Integration", "Institutional Dashboard", "Dedicated Training"] 
  },
};
