import { orchestrator } from "./model-orchestrator";
import { extractJson } from "./utils";
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

function ruleBasedClassify(query: string): IntentResult | null {
  const q = query.toLowerCase();

  if (/what is|define|explain|describe|tell me about|meaning of/i.test(q) && q.split(' ').length < 15) {
    return { intent: 'lookup', complexity: 1, suggestedProvider: 'gemini-flash', isSTEM: false, requiresGrounding: true };
  }
  if (/slo\s+[a-z0-9]+/i.test(q)) {
    return { intent: 'lookup', complexity: 1, suggestedProvider: 'gemini-flash', isSTEM: false, requiresGrounding: true };
  }

  if (/create|generate|write|build|develop|design.*lesson|lesson plan|rubric|quiz|assessment/i.test(q)) {
    const isSTEM = /math|science|physics|chemistry|biology|algebra|calculus/i.test(q);
    return { intent: 'creation', complexity: 3, suggestedProvider: 'gemini-pro', isSTEM, requiresGrounding: true };
  }

  if (/analyze|compare|contrast|evaluate|assess|audit|review/i.test(q)) {
    return { intent: 'analysis', complexity: 2, suggestedProvider: 'sambanova', isSTEM: false, requiresGrounding: true };
  }

  if (/vs|versus|difference between|compare/i.test(q)) {
    return { intent: 'comparison', complexity: 2, suggestedProvider: 'gemini-flash', isSTEM: false, requiresGrounding: false };
  }

  return null;
}

export async function classifyIntent(query: string): Promise<IntentResult> {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const key = createHash('md5').update(normalized).digest('hex');

  const cached = cacheGet(key);
  if (cached) return cached;

  const ruled = ruleBasedClassify(query);
  if (ruled) {
    cacheSet(key, ruled);
    return ruled;
  }

  try {
    const prompt = `Classify the pedagogical intent of this user query: "${query}"
    
Return ONLY a JSON object with this schema:
{
  "intent": "lookup" | "creation" | "analysis" | "comparison" | "general",
  "complexity": 1 | 2 | 3,
  "suggestedProvider": "string",
  "isSTEM": boolean,
  "requiresGrounding": boolean
}`;

    const result = await orchestrator.executeTask(prompt, 'lookup');
    const parsed = extractJson(result.text || '{}');
    if (parsed?.intent) {
      cacheSet(key, parsed);
      return parsed;
    }
  } catch (e) {
    console.warn('[IntentClassifier] AI call failed, using default.');
  }

  const fallback: IntentResult = {
    intent: 'general',
    complexity: 1,
    suggestedProvider: 'gemini-flash',
    isSTEM: false,
    requiresGrounding: true
  };
  cacheSet(key, fallback);
  return fallback;
}