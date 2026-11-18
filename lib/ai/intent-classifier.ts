import { createHash } from "crypto";

export type QueryIntent = 'lookup' | 'creation' | 'analysis' | 'comparison' | 'general';

export interface IntentResult {
  intent: QueryIntent;
  complexity: 1 | 2 | 3;
  suggestedProvider: string;
  isSTEM: boolean;
  requiresGrounding: boolean;
}

const CACHE_MAX = 500;
const intentCache = new Map<string, IntentResult>();

function cacheGet(key: string): IntentResult | null {
  const val = intentCache.get(key);
  if (!val) return null;
  intentCache.delete(key);
  intentCache.set(key, val);
  return val;
}

function cacheSet(key: string, val: IntentResult) {
  if (intentCache.size >= CACHE_MAX) {
    intentCache.delete(intentCache.keys().next().value!);
  }
  intentCache.set(key, val);
}

function ruleBasedClassify(query: string): IntentResult {
  const q = query.toLowerCase();
  const wordCount = q.trim().split(/\s+/).length;
  const isSTEM = /math|science|physics|chemistry|biology|algebra|calculus|geometry|equation|fraction/i.test(q);

  if (/^(hi|hello|hey|assalam|salam|good\s+(morning|afternoon|evening)|thanks|thank you)\b/i.test(q.trim()) && wordCount <= 6) {
    return { intent: 'general', complexity: 1, suggestedProvider: 'gemini-flash', isSTEM: false, requiresGrounding: false };
  }

  if (/what is|define|explain|describe|tell me about|meaning of|summarize|list/i.test(q) && wordCount < 18) {
    return { intent: 'lookup', complexity: 1, suggestedProvider: 'gemini-flash', isSTEM, requiresGrounding: true };
  }

  if (/slo\s*[:\-]?\s*[a-z0-9]/i.test(q)) {
    return { intent: 'lookup', complexity: 1, suggestedProvider: 'gemini-flash', isSTEM, requiresGrounding: true };
  }

  if (/create|generate|write|build|develop|design|lesson\s*plan|5e\s*lesson|rubric|quiz|assessment|worksheet/i.test(q)) {
    return { intent: 'creation', complexity: 3, suggestedProvider: 'gemini-pro', isSTEM, requiresGrounding: true };
  }

  if (/analyze|compare|contrast|evaluate|assess|audit|review/i.test(q)) {
    return { intent: 'analysis', complexity: 2, suggestedProvider: 'gemini-flash', isSTEM, requiresGrounding: true };
  }

  if (/vs|versus|difference between/i.test(q)) {
    return { intent: 'comparison', complexity: 2, suggestedProvider: 'gemini-flash', isSTEM, requiresGrounding: false };
  }

  return {
    intent: 'general',
    complexity: wordCount > 25 ? 2 : 1,
    suggestedProvider: 'gemini-flash',
    isSTEM,
    requiresGrounding: true
  };
}

export async function classifyIntent(query: string): Promise<IntentResult> {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const key = createHash('md5').update(normalized).digest('hex');

  const cached = cacheGet(key);
  if (cached) return cached;

  const ruled = ruleBasedClassify(query);
  cacheSet(key, ruled);
  return ruled;
}