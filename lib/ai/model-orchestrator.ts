// lib/ai/model-orchestrator.ts
// 7-ENGINE NEURAL GRID — Task-specialized routing with full fallback chain

import {
  callGemini, callDeepSeek, callGroq,
  callCerebras, callSambanova, callOpenRouter,
  AIResponse, AIRequestConfig
} from './providers';

// ─── TASK TYPES (maps to your Neural Tools) ───────────────────────
export type TaskType =
  | 'INGEST_LINEARIZE'    // PDF → Master MD (longest, most complex)
  | 'LESSON_PLAN'         // Master Plan tool — 5E/UbD/Hunter
  | 'QUIZ_GENERATE'       // Neural Quiz tool — MCQ/CRQ
  | 'RUBRIC_GENERATE'     // Fidelity Rubric tool
  | 'BLOOM_TAG'           // SLO Bloom classification
  | 'AUDIT_TAG'           // Audit Tagger tool
  | 'CHAT_LOOKUP'         // Real-time SLO lookup/chat
  | 'SLO_PARSE'           // Extract SLOs from text → JSON
  | 'VERTICAL_ALIGN';     // Grade-to-grade alignment analysis

// ─── ROUTING TABLE ────────────────────────────────────────────────
// Each task has a PRIMARY engine + ordered FALLBACK chain
// Based on: context needs, speed requirements, JSON reliability

interface RouteConfig {
  description: string;
  primary: () => Promise<AIResponse>;
  fallbacks: Array<() => Promise<AIResponse>>;
}

export class NeuralOrchestrator {

  private async executeWithFallback(
    routes: Array<() => Promise<AIResponse>>,
    taskType: TaskType
  ): Promise<AIResponse> {
    let lastError: Error | null = null;

    for (let i = 0; i < routes.length; i++) {
      try {
        const result = await routes[i]();
        if (i > 0) {
          console.log(`[Grid] Task ${taskType}: Fallback level ${i} succeeded (${result.provider})`);
        }
        return result;
      } catch (err: any) {
        lastError = err;
        const isRateLimit = err.message?.includes('429') || err.message?.includes('rate');
        const isModel = err.message?.includes('404') || err.message?.includes('model');

        console.warn(`[Grid] ${taskType} attempt ${i + 1} failed on route ${i}: ${err.message?.substring(0, 80)}`);

        if (!isRateLimit && !isModel && i < routes.length - 1) {
          // Non-rate-limit error: still try next fallback but add small delay
          await new Promise(r => setTimeout(r, 500));
        } else if (isRateLimit) {
          // Rate limit: longer backoff before trying fallback
          await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
      }
    }

    throw new Error(
      `All synthesis engines failed for task ${taskType}. Last error: ${lastError?.message}`
    );
  }

  // ─── MASTER ROUTING FUNCTION ────────────────────────────────────
  async execute(
    prompt: string,
    taskType: TaskType,
    config: AIRequestConfig = {}
  ): Promise<AIResponse> {

    const routes = this.buildRoutes(prompt, taskType, config);
    return this.executeWithFallback(routes, taskType);
  }

  private buildRoutes(
    prompt: string,
    taskType: TaskType,
    config: AIRequestConfig
  ): Array<() => Promise<AIResponse>> {

    switch (taskType) {

      // ── INGEST_LINEARIZE: PDF → Structured Master MD
      // Needs: 100k+ context window, best instruction following
      // Primary: Gemini 2.5 Pro → Flash → OpenRouter (Gemini Flash)
      case 'INGEST_LINEARIZE':
        return [
          () => callGemini(prompt, 'gemini-2.5-pro-preview-06-05', {
            ...config, temperature: 0.1, maxTokens: 8192
          }),
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', {
            ...config, temperature: 0.1, maxTokens: 8192
          }),
          () => callOpenRouter(prompt, 'google/gemini-flash-1.5-8b', {
            ...config, temperature: 0.1
          }),
        ];

      // ── LESSON_PLAN: 5E / UbD / Madeline Hunter generation
      // Needs: Creative depth, pedagogical knowledge, structured output
      // Primary: Gemini 2.5 Pro → DeepSeek Reasoner → Groq 70B
      case 'LESSON_PLAN':
        return [
          () => callGemini(prompt, 'gemini-2.5-pro-preview-06-05', {
            ...config, temperature: 0.3, maxTokens: 8192
          }),
          () => callDeepSeek(prompt, 'deepseek-reasoner', {
            ...config, temperature: 0.2, maxTokens: 6144
          }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', {
            ...config, temperature: 0.3, maxTokens: 4096
          }),
          () => callOpenRouter(prompt, 'anthropic/claude-3-haiku', {
            ...config, temperature: 0.3
          }),
        ];

      // ── QUIZ_GENERATE: MCQ, CRQ, Bloom-scaled assessments
      // Needs: Fast, reliable, structured JSON output for question banks
      // Primary: Sambanova 70B → Groq → Gemini Flash
      case 'QUIZ_GENERATE':
        return [
          () => callSambanova(prompt, 'Meta-Llama-3.3-70B-Instruct', {
            ...config, temperature: 0.2, maxTokens: 4096
          }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', {
            ...config, temperature: 0.2, maxTokens: 4096
          }),
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', {
            ...config, temperature: 0.2
          }),
          () => callOpenRouter(prompt, 'meta-llama/llama-3.1-70b-instruct', config),
        ];

      // ── RUBRIC_GENERATE: Fidelity rubrics, assessment criteria
      // Needs: Fast, structured, South Asian curriculum aligned
      // Primary: Groq 70B → Sambanova → Gemini Flash
      case 'RUBRIC_GENERATE':
        return [
          () => callGroq(prompt, 'llama-3.3-70b-versatile', {
            ...config, temperature: 0.1, maxTokens: 3072
          }),
          () => callSambanova(prompt, 'Meta-Llama-3.3-70B-Instruct', {
            ...config, temperature: 0.1
          }),
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', {
            ...config, temperature: 0.1
          }),
        ];

      // ── BLOOM_TAG: Classify SLOs against Bloom's taxonomy
      // Needs: Precise reasoning, JSON output, taxonomy expertise
      // Primary: DeepSeek Chat (V3, fast) → DeepSeek Reasoner → Groq
      case 'BLOOM_TAG':
        return [
          () => callDeepSeek(prompt, 'deepseek-chat', {
            ...config, temperature: 0.0, maxTokens: 2048
          }),
          () => callDeepSeek(prompt, 'deepseek-reasoner', {
            ...config, temperature: 0.0, maxTokens: 2048
          }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', {
            ...config, temperature: 0.0, maxTokens: 2048
          }),
        ];

      // ── AUDIT_TAG: Curriculum audit, gap analysis
      // Needs: Analytical reasoning, comparison, structured report
      // Primary: DeepSeek Reasoner → Gemini 2.5 Flash → Groq
      case 'AUDIT_TAG':
        return [
          () => callDeepSeek(prompt, 'deepseek-reasoner', {
            ...config, temperature: 0.1, maxTokens: 4096
          }),
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', {
            ...config, temperature: 0.1
          }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', {
            ...config, temperature: 0.1
          }),
        ];

      // ── SLO_PARSE: Extract and structure SLOs into JSON
      // Needs: Precise JSON output, structured extraction
      // Primary: DeepSeek Chat → Groq → Gemini Flash
      case 'SLO_PARSE':
        return [
          () => callDeepSeek(prompt, 'deepseek-chat', {
            ...config, temperature: 0.0, maxTokens: 4096
          }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', {
            ...config, temperature: 0.0, maxTokens: 4096
          }),
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', {
            ...config, temperature: 0.0
          }),
        ];

      // ── CHAT_LOOKUP: Real-time SLO lookup, instant Q&A
      // Needs: FASTEST possible response, simple queries
      // Primary: Cerebras (wafer-scale) → Groq 8B → Groq 70B
      case 'CHAT_LOOKUP':
        return [
          () => callCerebras(prompt, 'llama3.1-70b', {
            ...config, temperature: 0.1, maxTokens: 1024
          }),
          () => callGroq(prompt, 'llama-3.1-8b-instant', {
            ...config, temperature: 0.1, maxTokens: 1024
          }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', {
            ...config, temperature: 0.1, maxTokens: 2048
          }),
        ];

      // ── VERTICAL_ALIGN: Grade-to-grade prerequisite mapping
      // Needs: Deep reasoning across multiple grade contexts
      // Primary: DeepSeek Reasoner → Gemini 2.5 Pro → OpenRouter
      case 'VERTICAL_ALIGN':
        return [
          () => callDeepSeek(prompt, 'deepseek-reasoner', {
            ...config, temperature: 0.1, maxTokens: 6144
          }),
          () => callGemini(prompt, 'gemini-2.5-pro-preview-06-05', {
            ...config, temperature: 0.1
          }),
          () => callOpenRouter(prompt, 'anthropic/claude-3-haiku', config),
        ];

      default:
        // Generic fallback
        return [
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', config),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', config),
          () => callOpenRouter(prompt, 'google/gemini-flash-1.5', config),
        ];
    }
  }

  // ─── UI GRID STATUS ────────────────────────────────────────────
  // Called by your status bar component to show real engine names
  getGridStatus() {
    return [
      {
        id: 'gemini-pro',
        displayName: 'GEMINI 2.5 PRO',
        provider: 'Google',
        model: 'gemini-2.5-pro-preview-06-05',
        tasks: ['LESSON_PLAN', 'INGEST_LINEARIZE'],
        status: 'ONLINE',
        envKey: 'API_KEY',
      },
      {
        id: 'deepseek',
        displayName: 'DEEPSEEK R1',
        provider: 'DeepSeek',
        model: 'deepseek-reasoner',
        tasks: ['BLOOM_TAG', 'AUDIT_TAG', 'VERTICAL_ALIGN'],
        status: process.env.DEEPSEEK_API_KEY ? 'ONLINE' : 'DISABLED',
        envKey: 'DEEPSEEK_API_KEY',
      },
      {
        id: 'groq',
        displayName: 'GROQ 3 (LLAMA)',
        provider: 'Groq',
        model: 'llama-3.3-70b-versatile',
        tasks: ['RUBRIC_GENERATE', 'CHAT_LOOKUP'],
        status: process.env.GROQ_API_KEY ? 'ONLINE' : 'DISABLED',
        envKey: 'GROQ_API_KEY',
      },
      {
        id: 'cerebras',
        displayName: 'CEREBRAS WS',
        provider: 'Cerebras',
        model: 'llama3.1-70b',
        tasks: ['CHAT_LOOKUP'],
        status: process.env.CEREBRAS_API_KEY ? 'ONLINE' : 'DISABLED',
        envKey: 'CEREBRAS_API_KEY',
      },
      {
        id: 'sambanova',
        displayName: 'SAMBANOVA SN40L',
        provider: 'Sambanova',
        model: 'Meta-Llama-3.3-70B-Instruct',
        tasks: ['QUIZ_GENERATE'],
        status: process.env.SAMBANOVA_API_KEY ? 'ONLINE' : 'DISABLED',
        envKey: 'SAMBANOVA_API_KEY',
      },
      {
        id: 'openrouter',
        displayName: 'OPENROUTER GW',
        provider: 'OpenRouter',
        model: 'multi-provider',
        tasks: ['FALLBACK'],
        status: process.env.OPENROUTER_API_KEY ? 'STANDBY' : 'DISABLED',
        envKey: 'OPENROUTER_API_KEY',
      },
    ];
  }
}

// Singleton export
export const neuralGrid = new NeuralOrchestrator();

// Legacy compatibility — old code using 'orchestrator' still works
export const orchestrator = {
  executeTask: async (prompt: string, complexity: 'lookup' | 'strategy' | 'creation' = 'strategy') => {
    const taskMap = {
      'lookup': 'CHAT_LOOKUP' as TaskType,
      'strategy': 'BLOOM_TAG' as TaskType,
      'creation': 'LESSON_PLAN' as TaskType,
    };
    const result = await neuralGrid.execute(prompt, taskMap[complexity]);
    return { text: result.text, modelUsed: result.modelUsed, timestamp: new Date().toISOString() };
  }
};
