// constants.ts
import { UserRole, SubscriptionPlan } from './types';

export const APP_NAME = "Pedagogy Master AI";

export const BLOOM_LEVELS = [
  "Remember", "Understand", "Apply",
  "Analyze", "Evaluate", "Create"
];

// FOUNDER SECRETS - Loaded from Vercel Environment Variables
export const DEFAULT_MASTER_PROMPT = `# Basic fallback prompt

You are Pedagogy Master AI, a helpful educational assistant.`;

export const LATEST_SQL_BLUEPRINT = `-- Your SQL schema here if needed`;
