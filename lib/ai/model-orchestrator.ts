import { GoogleGenAI } from "@google/genai";

export type ComplexityLevel = 'lookup' | 'strategy' | 'creation';

/**
 * WORLD-CLASS MODEL ORCHESTRATOR (v1.0)
 * Logic: Routes tasks based on complexity and enforces Pedagogy Persona.
 */
export class ModelOrchestrator {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  /**
   * Identifies the optimal engine for a specific pedagogical task.
   */
  public getModelForTask(complexity: ComplexityLevel): string {
    switch (complexity) {
      case 'creation':
        return 'gemini-3-pro-preview'; // Deep reasoning for lesson plans
      case 'strategy':
        return 'gemini-3-flash-preview'; // Balanced performance
      case 'lookup':
      default:
        return 'gemini-3-flash-preview'; // High speed for SLO lookup
    }
  }

  /**
   * Applies the 'Master Pedagogy Persona' wrapper to ensure tonal consistency.
   */
  public applyPersona(prompt: string): string {
    return `
[SYSTEM_OVERLAY: MASTER_PEDAGOGY_EXPERT]
- Tone: Professional, approachabe, culturally aligned to South Asian educational contexts.
- Bloom Enforcement: Active.
- Rules: Never hallucinate SLOs. Cite document vault sources verbatim.

USER_TASK:
${prompt}
`;
  }

  /**
   * Executes a task with automatic routing and error recovery.
   */
  public async executeTask(prompt: string, complexity: ComplexityLevel = 'strategy') {
    const modelName = this.getModelForTask(complexity);
    const finalPrompt = this.applyPersona(prompt);

    try {
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
        config: {
          temperature: complexity === 'creation' ? 0.3 : 0.1,
          thinkingConfig: modelName.includes('pro') ? { thinkingBudget: 4096 } : { thinkingBudget: 0 }
        }
      });

      return {
        text: response.text || "Synthesis engine timed out.",
        modelUsed: modelName,
        timestamp: new Date().toISOString()
      };
    } catch (err: any) {
      // Fallback logic
      if (modelName === 'gemini-3-pro-preview') {
        return this.executeTask(prompt, 'lookup'); // Downgrade to Flash on failure
      }
      throw err;
    }
  }
}

export const orchestrator = new ModelOrchestrator();