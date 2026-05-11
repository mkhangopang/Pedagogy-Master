import { TaskResult, ComplexityLevel } from './model-orchestrator-types';
import { synthesize } from './synthesizer-core';
import { MODEL_PERSONA_WRAPPERS } from '../../config/model-personas';

/**
 * ADVANCED MODEL ORCHESTRATOR (v4.5 - UNIFIED)
 *
 * This node now delegates to SynthesizerCore to ensure all calls benefit 
 * from the multi-provider failover grid.
 */
export class ModelOrchestrator {
  private cache = new Map<string, { result: TaskResult; expiry: number }>();

  public getModelNameForTask(complexity: ComplexityLevel): string {
    switch (complexity) {
      case 'creation': return 'gemini-pro';
      case 'strategy': return 'gemini-flash';
      case 'lookup':
      default: return 'gemini-flash-lite';
    }
  }

  public applyPedagogyPersona(
    prompt: string,
    provider: keyof typeof MODEL_PERSONA_WRAPPERS = 'gemini'
  ): string {
    return MODEL_PERSONA_WRAPPERS[provider](prompt);
  }

  /**
   * Executes a pedagogical task via the Synthesizer Grid.
   */
  public async executeTask(
    prompt: string,
    complexity: ComplexityLevel = 'strategy',
    history: any[] = [],
    systemInstruction: string = 'You are a pedagogical AI assistant.'
  ): Promise<TaskResult> {
    const cacheKey = `orch:${complexity}:${prompt.substring(0, 100)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) return cached.result;

    const start = Date.now();
    const wrappedPrompt = this.applyPedagogyPersona(prompt);

    try {
      const result = await synthesize(wrappedPrompt, {
        history,
        systemPrompt: systemInstruction,
        complexity: complexity === 'creation' ? 3 : complexity === 'strategy' ? 2 : 1
      });

      const taskResult: TaskResult = {
        text: result.text,
        modelUsed: result.provider,
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start
      };

      this.cache.set(cacheKey, { result: taskResult, expiry: Date.now() + 5 * 60 * 1000 });
      return taskResult;
    } catch (err: any) {
      console.error("[Orchestrator] Execution failed:", err);
      return {
        text: `The neural grid is currently saturated. Error: ${err.message}`,
        modelUsed: 'failed',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start
      };
    }
  }
}

export const orchestrator = new ModelOrchestrator();
