// lib/ai/model-orchestrator.ts
// 8-ENGINE NEURAL GRID — Task-specialized routing with full fallback chain

import {
  callGemini, callDeepSeek, callGroq,
  callCerebras, callSambanova, callOpenRouter,
  callAIGateway, callMistral,
  AIResponse, AIRequestConfig
} from './providers/providers';

export type TaskType =
  | 'INGEST_LINEARIZE'
  | 'LESSON_PLAN'
  | 'QUIZ_GENERATE'
  | 'RUBRIC_GENERATE'
  | 'BLOOM_TAG'
  | 'AUDIT_TAG'
  | 'CHAT_LOOKUP'
  | 'SLO_PARSE'
  | 'VERTICAL_ALIGN';

export class NeuralOrchestrator {

  private async executeWithFallback(
    routes: Array<() => Promise<AIResponse>>,
    taskType: TaskType
  ): Promise<AIResponse> {
    let lastError: Error | null = null;

    for (let i = 0; i < routes.length; i++) {
      try {
        const result = await routes[i]();
        if (i > 0) console.log(`[Grid] ${taskType}: fallback level ${i} succeeded (${result.provider})`);
        return result;
      } catch (err: any) {
        lastError = err;
        const isRateLimit = err.message?.includes('429') || err.message?.includes('rate');
        console.warn(`[Grid] ${taskType} attempt ${i + 1} failed: ${err.message?.substring(0, 80)}`);
        await new Promise(r => setTimeout(r, isRateLimit ? 2000 * (i + 1) : 500));
      }
    }

    throw new Error(`All engines failed for ${taskType}. Last: ${lastError?.message}`);
  }

  async execute(
    prompt: string,
    taskType: TaskType,
    config: AIRequestConfig = {}
  ): Promise<AIResponse> {
    return this.executeWithFallback(this.buildRoutes(prompt, taskType, config), taskType);
  }

  private buildRoutes(
    prompt: string,
    taskType: TaskType,
    config: AIRequestConfig
  ): Array<() => Promise<AIResponse>> {

    switch (taskType) {

      // ── INGEST_LINEARIZE: Heavy curriculum processing
      case 'INGEST_LINEARIZE':
        return [
          () => callGemini(prompt, 'gemini-2.5-pro-preview-06-05', { ...config, temperature: 0.1, maxTokens: 8192 }),
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', { ...config, temperature: 0.1, maxTokens: 8192 }),
          () => callMistral(prompt.substring(0, 32000), 'mistral-large-latest', { ...config, temperature: 0.1, maxTokens: 4096 }),
          () => callAIGateway(prompt, { ...config, temperature: 0.1, maxTokens: 4096 }),
          () => callGroq(prompt.substring(0, 24000), 'llama-3.3-70b-versatile', { ...config, temperature: 0.1, maxTokens: 4096 }),
          () => callDeepSeek(prompt.substring(0, 24000), 'deepseek-chat', { ...config, temperature: 0.1, maxTokens: 4096 }),
          () => callOpenRouter(prompt.substring(0, 12000), 'google/gemini-2.0-flash-001', { ...config, temperature: 0.1, maxTokens: 2000 }),
        ];

      // ── LESSON_PLAN: 5E / UbD / Madeline Hunter
      case 'LESSON_PLAN':
        return [
          () => callGemini(prompt, 'gemini-2.5-pro-preview-06-05', { ...config, temperature: 0.3, maxTokens: 8192 }),
          () => callMistral(prompt, 'mistral-large-latest', { ...config, temperature: 0.3, maxTokens: 6144 }),
          () => callDeepSeek(prompt, 'deepseek-reasoner', { ...config, temperature: 0.2, maxTokens: 6144 }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', { ...config, temperature: 0.3, maxTokens: 4096 }),
          () => callOpenRouter(prompt, 'anthropic/claude-3-haiku-20240307', { ...config, temperature: 0.3, maxTokens: 3000 }),
        ];

      // ── QUIZ_GENERATE: MCQ, CRQ, Bloom-scaled assessments
      case 'QUIZ_GENERATE':
        return [
          () => callSambanova(prompt, 'Meta-Llama-3.3-70B-Instruct', { ...config, temperature: 0.2, maxTokens: 4096 }),
          () => callMistral(prompt, 'mistral-large-latest', { ...config, temperature: 0.2, maxTokens: 4096 }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', { ...config, temperature: 0.2, maxTokens: 4096 }),
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', { ...config, temperature: 0.2 }),
          () => callOpenRouter(prompt, 'meta-llama/llama-3.3-70b-instruct', { ...config, maxTokens: 3000 }),
        ];

      // ── RUBRIC_GENERATE: Mistral primary — best structured output
      case 'RUBRIC_GENERATE':
        return [
          () => callMistral(prompt, 'mistral-large-latest', { ...config, temperature: 0.1, maxTokens: 3072 }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', { ...config, temperature: 0.1, maxTokens: 3072 }),
          () => callSambanova(prompt, 'Meta-Llama-3.3-70B-Instruct', { ...config, temperature: 0.1 }),
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', { ...config, temperature: 0.1 }),
        ];

      // ── BLOOM_TAG: Classify SLOs against Bloom's taxonomy
      case 'BLOOM_TAG':
        return [
          () => callDeepSeek(prompt, 'deepseek-chat', { ...config, temperature: 0.0, maxTokens: 2048 }),
          () => callMistral(prompt, 'mistral-small-latest', { ...config, temperature: 0.0, maxTokens: 2048 }),
          () => callDeepSeek(prompt, 'deepseek-reasoner', { ...config, temperature: 0.0, maxTokens: 2048 }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', { ...config, temperature: 0.0, maxTokens: 2048 }),
        ];

      // ── AUDIT_TAG: Curriculum audit, gap analysis
      case 'AUDIT_TAG':
        return [
          () => callDeepSeek(prompt, 'deepseek-reasoner', { ...config, temperature: 0.1, maxTokens: 4096 }),
          () => callMistral(prompt, 'mistral-large-latest', { ...config, temperature: 0.1, maxTokens: 4096 }),
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', { ...config, temperature: 0.1 }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', { ...config, temperature: 0.1 }),
        ];

      // ── SLO_PARSE: Mistral primary — best JSON extraction
      case 'SLO_PARSE':
        return [
          () => callMistral(prompt, 'mistral-large-latest', { ...config, temperature: 0.0, maxTokens: 4096 }),
          () => callDeepSeek(prompt, 'deepseek-chat', { ...config, temperature: 0.0, maxTokens: 4096 }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', { ...config, temperature: 0.0, maxTokens: 4096 }),
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', { ...config, temperature: 0.0 }),
        ];

      // ── CHAT_LOOKUP: Real-time SLO lookup — FASTEST first
      case 'CHAT_LOOKUP':
        return [
          () => callCerebras(prompt, 'llama3.1-70b', { ...config, temperature: 0.1, maxTokens: 1024 }),
          () => callGroq(prompt, 'llama-3.1-8b-instant', { ...config, temperature: 0.1, maxTokens: 1024 }),
          () => callMistral(prompt, 'mistral-small-latest', { ...config, temperature: 0.1, maxTokens: 1024 }),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', { ...config, temperature: 0.1, maxTokens: 2048 }),
        ];

      // ── VERTICAL_ALIGN: Grade-to-grade prerequisite mapping
      case 'VERTICAL_ALIGN':
        return [
          () => callDeepSeek(prompt, 'deepseek-reasoner', { ...config, temperature: 0.1, maxTokens: 6144 }),
          () => callMistral(prompt, 'mistral-large-latest', { ...config, temperature: 0.1, maxTokens: 6144 }),
          () => callGemini(prompt, 'gemini-2.5-pro-preview-06-05', { ...config, temperature: 0.1 }),
          () => callOpenRouter(prompt, 'anthropic/claude-3-haiku-20240307', { ...config, maxTokens: 3000 }),
        ];

      default:
        return [
          () => callGemini(prompt, 'gemini-2.5-flash-preview-05-20', config),
          () => callMistral(prompt, 'mistral-small-latest', config),
          () => callGroq(prompt, 'llama-3.3-70b-versatile', config),
          () => callOpenRouter(prompt, 'google/gemini-2.0-flash-001', { ...config, maxTokens: 3000 }),
        ];
    }
  }

  getGridStatus() {
    return [
      {
        id: 'gemini-pro',
        displayName: 'GEMINI 2.5 PRO',
        provider: 'Google',
        model: 'gemini-2.5-pro-preview-06-05',
        tasks: ['LESSON_PLAN', 'INGEST_LINEARIZE'],
        status: process.env.API_KEY ? 'ONLINE' : 'DISABLED',
        envKey: 'API_KEY',
      },
      {
        id: 'gemini-flash',
        displayName: 'GEMINI 2.5 FLASH',
        provider: 'Google',
        model: 'gemini-2.5-flash-preview-05-20',
        tasks: ['FALLBACK', 'BLOOM_TAG'],
        status: process.env.API_KEY ? 'ONLINE' : 'DISABLED',
        envKey: 'API_KEY',
      },
      {
        id: 'mistral',
        displayName: 'MISTRAL LARGE',
        provider: 'Mistral',
        model: 'mistral-large-latest',
        tasks: ['RUBRIC_GENERATE', 'SLO_PARSE'],
        status: process.env.API_MISTRAL ? 'ONLINE' : 'DISABLED',
        envKey: 'API_MISTRAL',
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
        displayName: 'GROQ LLAMA 3.3',
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

export const neuralGrid = new NeuralOrchestrator();

export const orchestrator = {
  executeTask: async (prompt: string, complexity: 'lookup' | 'strategy' | 'creation' = 'strategy') => {
    const taskMap = {
      'lookup':   'CHAT_LOOKUP' as TaskType,
      'strategy': 'BLOOM_TAG'   as TaskType,
      'creation': 'LESSON_PLAN' as TaskType,
    };
    const result = await neuralGrid.execute(prompt, taskMap[complexity]);
    return { text: result.text, modelUsed: result.modelUsed, timestamp: new Date().toISOString() };
  }
};
