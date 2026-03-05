import { GoogleGenAI } from "@google/genai";
import { MODEL_PERSONA_WRAPPERS } from "../../config/model-personas";

export type ComplexityLevel = 'lookup' | 'strategy' | 'creation';

export interface TaskResult {
  text: string;
  modelUsed: string;
  timestamp: string;
  latencyMs: number;
}

/**
 * ADVANCED MODEL ORCHESTRATOR (v2.0 - RALPH EDITION)
 * Logic: Routes tasks based on complexity, tracks latency, and enforces unified personas.
 */
export class ModelOrchestrator {
  private ai: GoogleGenAI;
  private cache = new Map<string, { result: TaskResult; expiry: number }>();
  private latencyHistory: Record<string, number[]> = {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  /**
   * Smart routing based on task complexity.
   */
  public getModelForTask(complexity: ComplexityLevel): string {
    switch (complexity) {
      case 'creation':
        return 'gemini-3-pro-preview'; // High reasoning budget
      case 'strategy':
        return 'gemini-3-flash-preview'; // Balanced performance
      case 'lookup':
      default:
        return 'gemini-3-flash-preview'; // Low latency
    }
  }

  /**
   * Applies the unified persona wrapper based on the target provider.
   */
  public applyPedagogyPersona(prompt: string, provider: keyof typeof MODEL_PERSONA_WRAPPERS = 'gemini'): string {
    return MODEL_PERSONA_WRAPPERS[provider](prompt);
  }

  /**
   * Simple internal caching for repeated queries.
   */
  private getCached(key: string): TaskResult | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiry > Date.now()) return entry.result;
    if (entry) this.cache.delete(key);
    return null;
  }

  private setCache(key: string, result: TaskResult, ttlMs: number = 600000): void {
    this.cache.set(key, { result, expiry: Date.now() + ttlMs });
  }

  /**
   * Performance monitoring.
   */
  private trackLatency(model: string, ms: number) {
    if (!this.latencyHistory[model]) this.latencyHistory[model] = [];
    this.latencyHistory[model].push(ms);
    if (this.latencyHistory[model].length > 50) this.latencyHistory[model].shift();
  }

  /**
   * Executes a pedagogical task with automatic fallback and persona enforcement.
   */
  public async executeTask(prompt: string, complexity: ComplexityLevel = 'strategy'): Promise<TaskResult> {
    const cacheKey = `${complexity}:${prompt.substring(0, 100)}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const modelName = this.getModelForTask(complexity);
    const finalPrompt = this.applyPedagogyPersona(prompt, 'gemini');
    const start = Date.now();

    try {
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
        config: {
          temperature: complexity === 'creation' ? 0.3 : 0.1,
          thinkingConfig: modelName.includes('pro') ? { thinkingBudget: 4096 } : { thinkingBudget: 0 }
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

      this.setCache(cacheKey, result);
      return result;

    } catch (err: any) {
      console.warn(`[Orchestrator] Failure on ${modelName}:`, err.message);
      
      // FALLBACK LOGIC: Pro -> Flash
      if (modelName === 'gemini-3-pro-preview') {
        console.log(`[Orchestrator] Engaging Flash fallback...`);
        return this.executeTask(prompt, 'lookup'); 
      }
      throw err;
    }
  }

  public getAverageLatency(model: string): number {
    const history = this.latencyHistory[model] || [];
    if (history.length === 0) return 0;
    return history.reduce((a, b) => a + b, 0) / history.length;
  }
}

export const orchestrator = new ModelOrchestrator();
