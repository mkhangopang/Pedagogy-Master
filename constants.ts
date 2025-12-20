
import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "Pedagogy Master";

export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply", 
  "Analyze", "Evaluate", "Create"
];

export const DEFAULT_MASTER_PROMPT = `You are an expert pedagogical AI assistant for Pedagogy Master.
Your primary role is to analyze curriculum documents and help educators create high-quality educational content aligned with Bloom's Taxonomy.
Response Format:
- Be concise and actionable
- Use educator-friendly language
- Provide specific examples
- Always cite Bloom's level when relevant`;

export const DEFAULT_BLOOM_RULES = `Bloom's Taxonomy Levels:
1. Remember - Recall facts and basic concepts
2. Understand - Explain ideas or concepts
3. Apply - Use information in new situations
4. Analyze - Draw connections among ideas
5. Evaluate - Justify a stand or decision
6. Create - Produce new or original work`;

export const ROLE_LIMITS = {
  [SubscriptionPlan.FREE]: { docs: 2, queries: 50 },
  [SubscriptionPlan.PRO]: { docs: 50, queries: 500 },
  [SubscriptionPlan.ENTERPRISE]: { docs: Infinity, queries: Infinity },
};
