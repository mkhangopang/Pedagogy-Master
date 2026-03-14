import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { MODEL_PERSONA_WRAPPERS } from "../../config/model-personas";
import { callOpenRouter } from "./providers/openrouter";
import { callSambaNova } from "./providers/sambanova";
import { callGroq } from "./providers/groq";
import { callMistral } from "./providers/mistral";
import { callGrok } from "./providers/grok";
import { callCerebras } from "./providers/cerebras";
import { callDeepSeek } from "./providers/deepseek";

import { resolveApiKey } from "../env-server";

export type ComplexityLevel = 'lookup' | 'strategy' | 'creation';

export interface TaskResult {
  text: string;
  modelUsed: string;
  timestamp: string;
  latencyMs: number;
}

/**
 * ADVANCED MODEL ORCHESTRATOR (v3.0 - MULTI-NODE FALLBACK EDITION)
 * Logic: Routes tasks based on complexity, tracks latency, and automatically fallbacks on quota errors.
 */
export class ModelOrchestrator {
  private ai: GoogleGenAI;
  private cache = new Map<string, { result: TaskResult; expiry: number }>();
  private latencyHistory: Record<string, number[]> = {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: resolveApiKey() });
  }

  /**
   * Smart routing based on task complexity.
   */
  public getModelForTask(complexity: ComplexityLevel): string {
    switch (complexity) {
      case 'creation':
        return 'gemini-3.1-pro-preview'; 
      case 'strategy':
        return 'gemini-3.1-flash-preview'; 
      case 'lookup':
      default:
        return 'gemini-3-flash-preview'; // Use standard Flash for lookup
    }
  }

  /**
   * Applies the unified persona wrapper based on the target provider.
   */
  public applyPedagogyPersona(prompt: string, provider: keyof typeof MODEL_PERSONA_WRAPPERS = 'gemini'): string {
    return MODEL_PERSONA_WRAPPERS[provider](prompt);
  }

  /**
   * Executes a pedagogical task with automatic fallback across multiple providers.
   */
  public async executeTask(prompt: string, complexity: ComplexityLevel = 'strategy', history: any[] = [], systemInstruction: string = "You are a pedagogical AI assistant."): Promise<TaskResult> {
    const cacheKey = `${complexity}:${prompt.substring(0, 100)}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // TRY GEMINI FIRST (Primary Node)
    try {
      return await this.executeGemini(prompt, complexity);
    } catch (err: any) {
      const isQuotaError = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('RESOURCE_EXHAUSTED');
      
      if (isQuotaError) {
        console.warn(`[Orchestrator] Gemini Quota Exhausted. Engaging Multi-Node Fallback Protocol...`);
        
        // FALLBACK CHAIN
        const fallbacks = [
          { name: 'SambaNova', fn: () => callSambaNova(prompt, history, systemInstruction) },
          { name: 'Groq', fn: () => callGroq(prompt, history, systemInstruction) },
          { name: 'Grok', fn: () => callGrok(prompt, history, systemInstruction) },
          { name: 'Mistral', fn: () => callMistral(prompt, history, systemInstruction) },
          { name: 'OpenRouter', fn: () => callOpenRouter(prompt, history, systemInstruction) },
          { name: 'Cerebras', fn: () => callCerebras(prompt, history, systemInstruction) },
          { name: 'DeepSeek', fn: () => callDeepSeek(prompt, history, systemInstruction) }
        ];

        for (const node of fallbacks) {
          try {
            console.log(`[Orchestrator] Attempting Fallback Node: ${node.name}`);
            const start = Date.now();
            const text = await node.fn();
            const latency = Date.now() - start;
            
            const result: TaskResult = {
              text,
              modelUsed: node.name,
              timestamp: new Date().toISOString(),
              latencyMs: latency
            };
            this.setCache(cacheKey, result);
            return result;
          } catch (fallbackErr: any) {
            console.error(`[Orchestrator] Fallback Node ${node.name} Failed:`, fallbackErr.message);
            continue; // Try next node
          }
        }
      }
      
      throw err; // If all fallbacks fail or it's not a quota error
    }
  }

  private async executeGemini(prompt: string, complexity: ComplexityLevel): Promise<TaskResult> {
    const modelName = this.getModelForTask(complexity);
    const finalPrompt = this.applyPedagogyPersona(prompt, 'gemini');
    const start = Date.now();

    const response = await this.ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
      config: {
        temperature: complexity === 'creation' ? 0.3 : 0.1,
        thinkingConfig: modelName.includes('pro') ? { thinkingLevel: ThinkingLevel.HIGH } : undefined
      }
    });

    const latency = Date.now() - start;
    this.trackLatency(modelName, latency);

    const result: TaskResult = {
      text: response.text || "Synthesis timed out.",
      modelUsed: modelName,
      timestamp: new Date().toISOString(),
      latencyMs: latency
    };

    return result;
  }

  private getCached(key: string): TaskResult | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiry > Date.now()) return entry.result;
    if (entry) this.cache.delete(key);
    return null;
  }

  private setCache(key: string, result: TaskResult, ttlMs: number = 600000): void {
    this.cache.set(key, { result, expiry: Date.now() + ttlMs });
  }

  private trackLatency(model: string, ms: number) {
    if (!this.latencyHistory[model]) this.latencyHistory[model] = [];
    this.latencyHistory[model].push(ms);
    if (this.latencyHistory[model].length > 50) this.latencyHistory[model].shift();
  }

  public getAverageLatency(model: string): number {
    const history = this.latencyHistory[model] || [];
    if (history.length === 0) return 0;
    return history.reduce((a, b) => a + b, 0) / history.length;
  }
}

export const orchestrator = new ModelOrchestrator();
