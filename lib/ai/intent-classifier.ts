
import { orchestrator } from "./model-orchestrator";

import { extractJson } from "./utils";

export type QueryIntent = 'lookup' | 'creation' | 'analysis' | 'comparison' | 'general';

export interface IntentResult {
  intent: QueryIntent;
  complexity: 1 | 2 | 3;
  suggestedProvider: string;
  isSTEM: boolean;
  requiresGrounding: boolean;
}

/**
 * NEURAL INTENT CLASSIFIER (v1.0)
 * Uses high-speed routing logic with multi-node fallback.
 */
export async function classifyIntent(query: string): Promise<IntentResult> {
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
    return extractJson(result.text || '{}');
  } catch (e) {
    // Default fallback
    return {
      intent: 'general',
      complexity: 2,
      suggestedProvider: 'gemini-flash',
      isSTEM: false,
      requiresGrounding: true
    };
  }
}
