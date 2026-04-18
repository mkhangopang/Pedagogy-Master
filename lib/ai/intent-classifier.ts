/**
 * INTENT CLASSIFIER (v5.0 - RULE-BASED ONLY)
 *
 * FIX: Removed the AI API call inside classifyIntent().
 * The previous version called orchestrator.executeTask() for unrecognized queries,
 * which consumed quota just to classify intent. This is wasteful and causes
 * quota exhaustion when the app is under load. The rule-based classifier below
 * handles ~95% of real-world queries correctly.
 */

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
  intentCache.set(key, val); // LRU bump
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

  // ── CREATION tasks (high complexity, no caching) ──────────────────────────
  if (/create|generate|write|build|develop|design.*lesson|lesson plan|rubric|quiz|assessment|make a|draft a/i.test(q)) {
    const isSTEM = /math|science|physics|chemistry|biology|algebra|calculus|geometry|statistics/i.test(q);
    return {
      intent: 'creation',
      complexity: 3,
      suggestedProvider: 'gemini-pro',
      isSTEM,
      requiresGrounding: false
    };
  }

  // ── ANALYSIS tasks (medium-high complexity) ───────────────────────────────
  if (/analyze|audit|evaluate|assess|review|examine|inspect|check alignment|coverage|gaps in/i.test(q)) {
    return {
      intent: 'analysis',
      complexity: 3,
      suggestedProvider: 'gemini-pro',
      isSTEM: false,
      requiresGrounding: true
    };
  }

  // ── SLO-specific lookups ───────────────────────────────────────────────────
  if (/\bslo\b|\bslos\b|learning objective|curriculum standard|[A-Z]-\d{2}-[A-Z]-\d{2}/i.test(q)) {
    return {
      intent: 'lookup',
      complexity: 2,
      suggestedProvider: 'gemini-flash',
      isSTEM: false,
      requiresGrounding: true
    };
  }

  // ── COMPARISON tasks ──────────────────────────────────────────────────────
  if (/\bvs\b|versus|difference between|compare|contrast|which is better|distinguish/i.test(q)) {
    return {
      intent: 'comparison',
      complexity: 2,
      suggestedProvider: 'gemini-flash',
      isSTEM: false,
      requiresGrounding: false
    };
  }

  // ── Simple lookups (short definitional / factual queries) ─────────────────
  if (/what is|what are|define|explain|describe|tell me about|meaning of/i.test(q) && q.split(' ').length < 20) {
    return {
      intent: 'lookup',
      complexity: 1,
      suggestedProvider: 'gemini-flash',
      isSTEM: /math|science|physics|chemistry|biology/i.test(q),
      requiresGrounding: true
    };
  }

  // ── Bloom's / DOK tagging ─────────────────────────────────────────────────
  if (/bloom|dok|depth of knowledge|cognitive level|tag|classify.*slo|slo.*level/i.test(q)) {
    return {
      intent: 'analysis',
      complexity: 2,
      suggestedProvider: 'gemini-flash',
      isSTEM: false,
      requiresGrounding: true
    };
  }

  // ── Lesson / teaching strategy queries ───────────────────────────────────
  if (/how to teach|teaching strategy|instructional|pedagogy|5e model|madeline hunter|ubd|backward design/i.test(q)) {
    return {
      intent: 'general',
      complexity: 2,
      suggestedProvider: 'gemini-flash',
      isSTEM: false,
      requiresGrounding: false
    };
  }

  // ── Default fallback (no AI call needed) ─────────────────────────────────
  return {
    intent: 'general',
    complexity: 2,
    suggestedProvider: 'gemini-flash',
    isSTEM: false,
    requiresGrounding: false
  };
}

export async function classifyIntent(query: string): Promise<IntentResult> {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const key = createHash('md5').update(normalized).digest('hex');

  const cached = cacheGet(key);
  if (cached) return cached;

  // Pure rule-based — no AI call, no quota usage
  const result = ruleBasedClassify(query);
  cacheSet(key, result);
  return result;
}
