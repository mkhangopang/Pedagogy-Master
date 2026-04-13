import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { MODEL_PERSONA_WRAPPERS } from '../../config/model-personas';
import { callOpenRouter } from './providers/openrouter';
import { callSambaNova } from './providers/sambanova';
import { callGroq } from './providers/groq';
import { callMistral } from './providers/mistral';
import { callGrok } from './providers/grok';
import { callCerebras } from './providers/cerebras';
import { callDeepSeek } from './providers/deepseek';
import { resolveApiKey } from '../env-server';

export type ComplexityLevel = 'lookup' | 'strategy' | 'creation';

export interface TaskResult {
  text: string;
  modelUsed: string;
  timestamp: string;
  latencyMs: number;
}

/**
 * ADVANCED MODEL ORCHESTRATOR (v4.0)
 *
 * FIX-BUG-01: All Gemini model names corrected to actual published model IDs.
 *   "gemini-3.x-*-preview" do not exist as of April 2026.
 *
 * FIX-BUG-15: AI client is now lazy-initialized to prevent errors when this
 *   class is instantiated in an SSR context where resolveApiKey() returns ''.
 */
export class ModelOrchestrator {
  private _ai?: GoogleGenAI;
  private cache = new Map<string, { result: TaskResult; expiry: number }>();
  private latencyHistory: Record<string, number[]> = {};

  /**
   * FIX-BUG-15: Lazy getter — only initializes when actually needed (server-side).
   */
  private get ai(): GoogleGenAI {
    if (!this._ai) {
      const key = resolveApiKey();
      if (!key) throw new Error('Gemini API key not configured. Set GEMINI_API_KEY env var (server-side only).');
      this._ai = new GoogleGenAI({ apiKey: key });
    }
    return this._ai;
  }

  /**
   * FIX-BUG-01: Correct Gemini model names (April 2026).
   * Verified against Google AI Studio and the @google/genai SDK.
   */
  public getModelForTask(complexity: ComplexityLevel): string {
    switch (complexity) {
      case 'creation':
        // Most capable — for lesson plan generation, full curriculum synthesis
        return 'gemini-2.5-pro-preview-05-06';
      case 'strategy':
        // Fast + capable — for multi-step pedagogical reasoning
        return 'gemini-2.0-flash';
      case 'lookup':
      default:
        // Fastest + cheapest — for SLO lookups, simple Q&A
        return 'gemini-2.0-flash-lite';
    }
  }

  public applyPedagogyPersona(
    prompt: string,
    provider: keyof typeof MODEL_PERSONA_WRAPPERS = 'gemini'
  ): string {
    return MODEL_PERSONA_WRAPPERS[provider](prompt);
  }

  /**
   * Executes a pedagogical task with automatic fallback across multiple providers.
   */
  public async executeTask(
    prompt: string,
    complexity: ComplexityLevel = 'strategy',
    history: any[] = [],
    systemInstruction: string = 'You are a pedagogical AI assistant.'
  ): Promise<TaskResult> {
    const cacheKey = `${complexity}:${prompt.substring(0, 100)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) return cached.result;

    const start = Date.now();
    const model = this.getModelForTask(complexity);
    const wrappedPrompt = this.applyPedagogyPersona(prompt);

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: [
          ...history,
          { role: 'user', parts: [{ text: wrappedPrompt }] },
        ],
        config: {
          systemInstruction,
          maxOutputTokens: complexity === 'creation' ? 16384 : 8192,
          temperature: complexity === 'lookup' ? 0.1 : 0.7,
        },
      });

      const result: TaskResult = {
        text: response.text || '',
        modelUsed: model,
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };

      this.cache.set(cacheKey, { result, expiry: Date.now() + 5 * 60 * 1000 });
      return result;
    } catch (err: any) {
      console.warn(`[Orchestrator] ${model} failed: ${err.message}. Attempting fallback...`);
      return this.fallback(prompt, complexity, start, history, systemInstruction);
    }
  }

  private async fallback(
    prompt: string,
    complexity: ComplexityLevel,
    start: number,
    history: any[] = [],
    systemInstruction: string = 'You are a pedagogical AI assistant.'
  ): Promise<TaskResult> {
    const fallbacks = [
      async () => {
        const text = await callGroq(prompt, history, systemInstruction);
        return { text, modelUsed: 'groq/llama-3.3-70b' };
      },
      async () => {
        const text = await callGrok(prompt, history, systemInstruction);
        return { text, modelUsed: 'grok-2-1212' };
      },
      async () => {
        const text = await callMistral(prompt, history, systemInstruction);
        return { text, modelUsed: 'mistral-large' };
      },
    ];

    for (const attempt of fallbacks) {
      try {
        const { text, modelUsed } = await attempt();
        return {
          text,
          modelUsed,
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
        };
      } catch (_) {
        // Continue to next fallback
      }
    }

    return {
      text: '',
      modelUsed: 'none',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - start,
    };
  }
}

export const orchestrator = new ModelOrchestrator();
