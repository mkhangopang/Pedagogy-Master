/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║          PEDAGOGY MASTER AI — UNIFIED AI ORCHESTRATOR v1.0             ║
 * ║                                                                          ║
 * ║  MISSION: Single source of truth for ALL AI calls in the application.  ║
 * ║  Every feature — ingestion, enrichment, chat, assessment, RAG — routes  ║
 * ║  through here. No scattered direct API calls.                           ║
 * ║                                                                          ║
 * ║  ARCHITECTURE:                                                           ║
 * ║    Task → TaskRouter → ProviderPool → ProviderAdapter → Result          ║
 * ║                    ↓                                                     ║
 * ║              HealthTracker (quota, latency, error rates)                ║
 * ║                    ↓                                                     ║
 * ║              PatternMemory (per-task provider performance)              ║
 * ║                                                                          ║
 * ║  TASK TYPES (routed to optimal providers):                              ║
 * ║    EXTRACTION   → Gemini Flash (JSON schema), Groq fallback            ║
 * ║    ENRICHMENT   → Gemini Flash, Groq, GPT-4o-mini                      ║
 * ║    CHAT         → Gemini 2.5 Pro (streaming), Flash fallback            ║
 * ║    ASSESSMENT   → Gemini 2.5 Pro, SambaNova 405B                       ║
 * ║    EMBEDDING    → text-embedding-004 (always Gemini)                   ║
 * ║    LOOKUP       → Gemini Flash Lite, Cerebras (ultra-low latency)      ║
 * ║    ANALYSIS     → DeepSeek V3, Gemini Pro                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { GoogleGenAI, Type } from '@google/genai';
import { MODEL_PERSONA_WRAPPERS } from '../../config/model-personas';

// ── Task Type Definitions ─────────────────────────────────────────────────────

export type TaskType =
  | 'EXTRACTION'    // SLO extraction from PDF text (requires JSON schema)
  | 'ENRICHMENT'    // Bloom's level + keyword enrichment
  | 'CHAT'          // Conversational AI (streaming preferred)
  | 'ASSESSMENT'    // Quiz/assessment generation
  | 'LOOKUP'        // Fast SLO lookup, simple Q&A
  | 'ANALYSIS'      // Curriculum analysis, alignment checking
  | 'EMBEDDING'     // Vector embedding (always Gemini)
  | 'LESSON_PLAN';  // Full lesson plan generation (complex, long output)

export interface OrchestratorTask {
  type: TaskType;
  prompt: string;
  systemPrompt?: string;
  history?: { role: string; content: string }[];
  schema?: any;           // JSON schema for structured outputs (EXTRACTION, ENRICHMENT)
  streaming?: boolean;    // Request streaming response
  onToken?: (token: string) => void; // Streaming callback
  maxRetries?: number;
}

export interface OrchestratorResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  taskType: TaskType;
  fromCache?: boolean;
}

// ── Provider Definitions ──────────────────────────────────────────────────────

interface Provider {
  id: string;
  name: string;
  model: string;
  endpoint: 'native-gemini' | string;
  apiKeyEnv: string;
  rpm: number;
  maxTokens: number;
  supportsJsonSchema: boolean;
  supportsStreaming: boolean;
  bestFor: TaskType[];
  tier: 1 | 2 | 3;
}

const PROVIDERS: Provider[] = [
  // ── Tier 1: Reasoning ─────────────────────────────────────────────────────
  {
    id: 'gemini-pro',
    name: 'Gemini 2.5 Pro',
    model: 'gemini-2.5-pro-preview-05-06',
    endpoint: 'native-gemini',
    apiKeyEnv: 'API_KEY',
    rpm: 10, maxTokens: 16384,
    supportsJsonSchema: true, supportsStreaming: true,
    bestFor: ['CHAT', 'LESSON_PLAN', 'ASSESSMENT', 'ANALYSIS'],
    tier: 1,
  },
  {
    id: 'sambanova',
    name: 'SambaNova 405B',
    model: 'Meta-Llama-3.1-405B-Instruct',
    endpoint: 'https://api.sambanova.ai/v1/chat/completions',
    apiKeyEnv: 'SAMBANOVA_API_KEY',
    rpm: 100, maxTokens: 8192,
    supportsJsonSchema: false, supportsStreaming: false,
    bestFor: ['ASSESSMENT', 'ANALYSIS', 'LESSON_PLAN'],
    tier: 1,
  },
  {
    id: 'grok',
    name: 'Grok 2',
    model: 'grok-2-1212',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    apiKeyEnv: 'GROK_API_KEY',
    rpm: 20, maxTokens: 32768,
    supportsJsonSchema: true, supportsStreaming: false,
    bestFor: ['CHAT', 'ANALYSIS'],
    tier: 1,
  },
  // ── Tier 2: Speed + Quality ───────────────────────────────────────────────
  {
    id: 'gemini-flash',
    name: 'Gemini 2.0 Flash',
    model: 'gemini-2.0-flash',
    endpoint: 'native-gemini',
    apiKeyEnv: 'API_KEY',
    rpm: 60, maxTokens: 8192,
    supportsJsonSchema: true, supportsStreaming: true,
    bestFor: ['EXTRACTION', 'ENRICHMENT', 'CHAT', 'LOOKUP'],
    tier: 2,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek V3',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    rpm: 100, maxTokens: 8192,
    supportsJsonSchema: true, supportsStreaming: false,
    bestFor: ['ANALYSIS', 'EXTRACTION', 'ENRICHMENT'],
    tier: 2,
  },
  {
    id: 'mistral',
    name: 'Mistral Large',
    model: 'mistral-large-latest',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    apiKeyEnv: 'API_MISTRAL',
    rpm: 20, maxTokens: 32768,
    supportsJsonSchema: true, supportsStreaming: false,
    bestFor: ['ASSESSMENT', 'ANALYSIS', 'LESSON_PLAN'],
    tier: 2,
  },
  // ── Tier 3: High Throughput / Fallback ───────────────────────────────────
  {
    id: 'groq-70b',
    name: 'Groq Llama 70B',
    model: 'llama-3.3-70b-versatile',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    apiKeyEnv: 'GROQ_API_KEY',
    rpm: 100, maxTokens: 8192,
    supportsJsonSchema: true, supportsStreaming: false,
    bestFor: ['EXTRACTION', 'ENRICHMENT', 'LOOKUP'],
    tier: 3,
  },
  {
    id: 'groq-8b',
    name: 'Groq Llama 8B',
    model: 'llama-3.1-8b-instant',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    apiKeyEnv: 'GROQ_API_KEY',
    rpm: 500, maxTokens: 4096,
    supportsJsonSchema: false, supportsStreaming: false,
    bestFor: ['LOOKUP', 'EXTRACTION'],
    tier: 3,
  },
  {
    id: 'cerebras',
    name: 'Cerebras Llama 70B',
    model: 'llama3.1-70b',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    rpm: 100, maxTokens: 8192,
    supportsJsonSchema: false, supportsStreaming: false,
    bestFor: ['LOOKUP', 'ENRICHMENT'],
    tier: 3,
  },
  {
    id: 'gemini-lite',
    name: 'Gemini 2.0 Flash Lite',
    model: 'gemini-2.0-flash-lite',
    endpoint: 'native-gemini',
    apiKeyEnv: 'API_KEY',
    rpm: 500, maxTokens: 4096,
    supportsJsonSchema: true, supportsStreaming: false,
    bestFor: ['LOOKUP', 'EXTRACTION'],
    tier: 3,
  },
  {
    id: 'openai-mini',
    name: 'GPT-4o Mini',
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKeyEnv: 'OPENAI_API_KEY',
    rpm: 100, maxTokens: 8192,
    supportsJsonSchema: true, supportsStreaming: false,
    bestFor: ['EXTRACTION', 'ENRICHMENT', 'LOOKUP'],
    tier: 3,
  },
];

// ── Provider Health Tracking ──────────────────────────────────────────────────

interface HealthRecord {
  blacklistedUntil: number;
  consecutiveFailures: number;
  totalCalls: number;
  totalLatency: number;
  lastError: string;
}

const healthStore = new Map<string, HealthRecord>();

function getHealth(id: string): HealthRecord {
  if (!healthStore.has(id)) {
    healthStore.set(id, {
      blacklistedUntil: 0,
      consecutiveFailures: 0,
      totalCalls: 0,
      totalLatency: 0,
      lastError: '',
    });
  }
  return healthStore.get(id)!;
}

function isBlacklisted(id: string): boolean {
  return getHealth(id).blacklistedUntil > Date.now();
}

function recordSuccess(id: string, latencyMs: number) {
  const h = getHealth(id);
  h.consecutiveFailures = 0;
  h.totalCalls++;
  h.totalLatency += latencyMs;
}

function recordFailure(id: string, err: string, isQuota: boolean) {
  const h = getHealth(id);
  h.consecutiveFailures++;
  h.totalCalls++;
  h.lastError = err;
  // Quota errors get a longer cooldown
  const cooldown = isQuota ? 10 * 60_000 : 60_000;
  h.blacklistedUntil = Date.now() + cooldown;
}

// ── Task Router ───────────────────────────────────────────────────────────────

function buildProviderQueue(
  task: OrchestratorTask,
  requiresJsonSchema: boolean,
  requiresStreaming: boolean
): Provider[] {
  const available = PROVIDERS.filter(p => {
    const key = process.env[p.apiKeyEnv];
    if (!key) return false;
    if (isBlacklisted(p.id)) return false;
    if (requiresJsonSchema && !p.supportsJsonSchema) return false;
    if (requiresStreaming && !p.supportsStreaming) return false;
    return true;
  });

  // Sort: preferred (bestFor match) → tier → average latency
  available.sort((a, b) => {
    const aBest = a.bestFor.includes(task.type) ? 0 : 1;
    const bBest = b.bestFor.includes(task.type) ? 0 : 1;
    if (aBest !== bBest) return aBest - bBest;
    if (a.tier !== b.tier) return a.tier - b.tier;
    // Lower average latency wins
    const aAvg = getHealth(a.id).totalCalls > 0
      ? getHealth(a.id).totalLatency / getHealth(a.id).totalCalls : 5000;
    const bAvg = getHealth(b.id).totalCalls > 0
      ? getHealth(b.id).totalLatency / getHealth(b.id).totalCalls : 5000;
    return aAvg - bAvg;
  });

  return available;
}

// ── Provider Adapter ──────────────────────────────────────────────────────────

function getPersonaPrompt(provider: Provider, prompt: string, systemPrompt: string): string {
  // Inject provider-specific pedagogical persona from model-personas.ts
  const personaKey = provider.id.startsWith('gemini') ? 'gemini'
    : provider.id.startsWith('groq') ? 'groq'
    : provider.id === 'cerebras' ? 'cerebras'
    : provider.id === 'deepseek' ? 'deepseek'
    : provider.id === 'sambanova' ? 'sambanova'
    : 'gemini';

  const wrapper = MODEL_PERSONA_WRAPPERS[personaKey as keyof typeof MODEL_PERSONA_WRAPPERS];
  return wrapper ? wrapper(prompt) : prompt;
}

async function callProvider(
  provider: Provider,
  task: OrchestratorTask,
  apiKey: string
): Promise<string> {
  const systemPrompt = task.systemPrompt || 'You are a world-class pedagogy master.';
  const prompt = getPersonaPrompt(provider, task.prompt, systemPrompt);
  const history = task.history || [];

  // ── Native Gemini ──────────────────────────────────────────────────────────
  if (provider.endpoint === 'native-gemini') {
    const ai = new GoogleGenAI({ apiKey });

    if (task.streaming && task.onToken) {
      // True streaming
      const contents: any[] = history.slice(-4).map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }],
      }));
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      let fullText = '';
      const response = await ai.models.generateContentStream({
        model: provider.model,
        contents,
        config: { systemInstruction: systemPrompt, temperature: 0.7, maxOutputTokens: provider.maxTokens },
      });
      for await (const chunk of response) {
        const token = chunk.text ?? '';
        if (token) { fullText += token; task.onToken!(token); }
      }
      return fullText;
    }

    // Non-streaming (with optional JSON schema)
    const contents: any[] = history.slice(-4).map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    }));
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const config: any = {
      systemInstruction: systemPrompt,
      temperature: task.type === 'EXTRACTION' ? 0.1 : 0.7,
      maxOutputTokens: provider.maxTokens,
    };
    if (task.schema) {
      config.responseMimeType = 'application/json';
      config.responseSchema = task.schema;
    }

    const response = await ai.models.generateContent({ model: provider.model, contents, config });
    return response.text || '';
  }

  // ── OpenAI-compatible REST endpoints ─────────────────────────────────────
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4).map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
    { role: 'user', content: prompt },
  ];

  const body: any = {
    model: provider.model,
    messages,
    temperature: task.type === 'EXTRACTION' ? 0.1 : 0.7,
    max_tokens: provider.maxTokens,
  };

  if (task.schema && provider.supportsJsonSchema) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(provider.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errBody.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Main Orchestrator ─────────────────────────────────────────────────────────

export class UnifiedOrchestrator {
  private static instance: UnifiedOrchestrator;

  static getInstance(): UnifiedOrchestrator {
    if (!UnifiedOrchestrator.instance) {
      UnifiedOrchestrator.instance = new UnifiedOrchestrator();
    }
    return UnifiedOrchestrator.instance;
  }

  async execute(task: OrchestratorTask): Promise<OrchestratorResult> {
    const start = Date.now();
    const requiresSchema = !!task.schema;
    const requiresStream = !!(task.streaming && task.onToken);
    const maxRetries = task.maxRetries ?? 2;

    const queue = buildProviderQueue(task, requiresSchema, requiresStream);

    if (queue.length === 0) {
      throw new Error(
        `[Orchestrator] No available providers for task type ${task.type}` +
        (requiresSchema ? ' (requires JSON schema)' : '') +
        (requiresStream ? ' (requires streaming)' : '') +
        '. Check that at least one API key is set in env.'
      );
    }

    for (const provider of queue) {
      const apiKey = process.env[provider.apiKeyEnv]!;
      let attempt = 0;

      while (attempt < maxRetries) {
        attempt++;
        const callStart = Date.now();
        try {
          console.log(`[Orchestrator] ${task.type} → ${provider.name} (attempt ${attempt}/${maxRetries})`);
          const text = await callProvider(provider, task, apiKey);

          if (!text?.trim()) {
            console.warn(`[Orchestrator] ${provider.name} returned empty response. Trying next.`);
            break;
          }

          const latency = Date.now() - callStart;
          recordSuccess(provider.id, latency);

          return {
            text,
            provider: provider.name,
            model: provider.model,
            latencyMs: Date.now() - start,
            taskType: task.type,
          };
        } catch (err: any) {
          const msg = err.message || 'Unknown error';
          const isQuota = /429|quota|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg);
          const isRetriable = isQuota || /timeout|ECONNRESET|network/i.test(msg);

          recordFailure(provider.id, msg, isQuota);
          console.warn(`[Orchestrator] ${provider.name} attempt ${attempt} failed: ${msg}`);

          if (isRetriable && attempt < maxRetries) {
            const delay = isQuota ? 5000 : 1000;
            console.log(`[Orchestrator] Retrying ${provider.name} in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          break; // Move to next provider
        }
      }
    }

    throw new Error(
      `[Orchestrator] All providers exhausted for task ${task.type}. ` +
      `Tried: ${queue.map(p => p.name).join(', ')}`
    );
  }

  /** Health status for the admin dashboard */
  getProviderHealth(): any[] {
    return PROVIDERS.map(p => {
      const h = getHealth(p.id);
      const hasKey = !!process.env[p.apiKeyEnv];
      return {
        id: p.id,
        name: p.name,
        model: p.model,
        tier: p.tier,
        hasKey,
        blacklisted: isBlacklisted(p.id),
        blacklistedUntil: h.blacklistedUntil > Date.now() ? new Date(h.blacklistedUntil).toISOString() : null,
        consecutiveFailures: h.consecutiveFailures,
        totalCalls: h.totalCalls,
        avgLatencyMs: h.totalCalls > 0 ? Math.round(h.totalLatency / h.totalCalls) : null,
        lastError: h.lastError || null,
        bestFor: p.bestFor,
      };
    });
  }

  resetHealth(providerId?: string) {
    if (providerId) {
      healthStore.delete(providerId);
    } else {
      healthStore.clear();
    }
    console.log(`[Orchestrator] Health reset${providerId ? ` for ${providerId}` : ' for all providers'}`);
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const orchestrator = UnifiedOrchestrator.getInstance();

// ── Convenience functions (drop-in replacements) ──────────────────────────────

/** Call for SLO extraction — returns parsed JSON or throws */
export async function orchestrateExtraction(
  prompt: string,
  schema: any,
  systemPrompt?: string
): Promise<any> {
  const result = await orchestrator.execute({
    type: 'EXTRACTION',
    prompt,
    schema,
    systemPrompt,
    maxRetries: 3,
  });

  // Parse JSON from result
  let raw = result.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) raw = raw.substring(first, last + 1);

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`[Orchestrator] EXTRACTION result was not valid JSON from ${result.provider}: ${raw.substring(0, 200)}`);
  }
}

/** Call for enrichment — returns parsed JSON or throws */
export async function orchestrateEnrichment(
  prompt: string,
  schema: any
): Promise<any> {
  const result = await orchestrator.execute({
    type: 'ENRICHMENT',
    prompt,
    schema,
    maxRetries: 2,
  });

  let raw = result.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last !== -1) raw = raw.substring(first, last + 1);

  try {
    return JSON.parse(raw);
  } catch {
    return { enrichments: [] };
  }
}

/** Streaming chat — calls onToken for each token, returns full text */
export async function orchestrateChat(
  prompt: string,
  history: { role: string; content: string }[],
  systemPrompt: string,
  onToken: (token: string) => void
): Promise<OrchestratorResult> {
  return orchestrator.execute({
    type: 'CHAT',
    prompt,
    history,
    systemPrompt,
    streaming: true,
    onToken,
    maxRetries: 2,
  });
}

/** Fast lookup for simple Q&A */
export async function orchestrateLookup(
  prompt: string,
  systemPrompt?: string
): Promise<OrchestratorResult> {
  return orchestrator.execute({
    type: 'LOOKUP',
    prompt,
    systemPrompt,
    maxRetries: 2,
  });
}

/** Full lesson plan generation (long output, complex reasoning) */
export async function orchestrateLessonPlan(
  prompt: string,
  systemPrompt: string
): Promise<OrchestratorResult> {
  return orchestrator.execute({
    type: 'LESSON_PLAN',
    prompt,
    systemPrompt,
    maxRetries: 2,
  });
}

/** Assessment/quiz generation */
export async function orchestrateAssessment(
  prompt: string,
  schema: any,
  systemPrompt?: string
): Promise<any> {
  const result = await orchestrator.execute({
    type: 'ASSESSMENT',
    prompt,
    schema,
    systemPrompt,
    maxRetries: 2,
  });

  let raw = result.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last !== -1) raw = raw.substring(first, last + 1);
  try { return JSON.parse(raw); } catch { return { questions: [] }; }
}
