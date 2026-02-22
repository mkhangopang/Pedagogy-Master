// lib/ai/providers.ts
// Unified provider interface — all models speak the same language

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  text: string;
  modelUsed: string;
  provider: string;
  latencyMs: number;
  tokensUsed?: number;
}

export interface AIRequestConfig {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

// ─────────────────────────────────────────────
// PROVIDER 1: Google Gemini (via @google/genai)
// Used for: Master MD, Lesson Plans (long context)
// ─────────────────────────────────────────────
export async function callGemini(
  prompt: string,
  model: 'gemini-2.5-pro-preview-06-05' | 'gemini-2.5-flash-preview-05-20' | 'gemini-2.0-flash',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  const start = Date.now();

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: config.systemPrompt,
      temperature: config.temperature ?? 0.1,
      maxOutputTokens: config.maxTokens ?? 8192,
      thinkingConfig: model.includes('2.5-pro')
        ? { thinkingBudget: 4096 }
        : { thinkingBudget: 512 }
    }
  });

  return {
    text: response.text || '',
    modelUsed: model,
    provider: 'google',
    latencyMs: Date.now() - start,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 2: DeepSeek (OpenAI-compatible API)
// Used for: Bloom taxonomy, structured JSON, reasoning
// Models: deepseek-reasoner (R1), deepseek-chat (V3)
// ─────────────────────────────────────────────
export async function callDeepSeek(
  prompt: string,
  model: 'deepseek-reasoner' | 'deepseek-chat' = 'deepseek-chat',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();

  const messages: AIMessage[] = [];
  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: config.temperature ?? 0.1,
      max_tokens: config.maxTokens ?? 4096,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  return {
    text,
    modelUsed: model,
    provider: 'deepseek',
    latencyMs: Date.now() - start,
    tokensUsed: data.usage?.total_tokens,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 3: Groq (OpenAI-compatible — fastest)
// Used for: Rubrics, quick gen, real-time feedback
// Models: llama-3.3-70b-versatile, mixtral-8x7b-32768
// ─────────────────────────────────────────────
export async function callGroq(
  prompt: string,
  model: 'llama-3.3-70b-versatile' | 'llama-3.1-8b-instant' | 'mixtral-8x7b-32768' = 'llama-3.3-70b-versatile',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();

  const messages: AIMessage[] = [];
  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: config.temperature ?? 0.1,
      max_tokens: config.maxTokens ?? 4096,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  return {
    text,
    modelUsed: model,
    provider: 'groq',
    latencyMs: Date.now() - start,
    tokensUsed: data.usage?.total_tokens,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 4: Cerebras (Wafer-scale — FASTEST)
// Used for: Instant SLO lookups, real-time chat
// Models: llama3.1-8b, llama3.1-70b
// ─────────────────────────────────────────────
export async function callCerebras(
  prompt: string,
  model: 'llama3.1-8b' | 'llama3.1-70b' = 'llama3.1-70b',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();

  const messages: AIMessage[] = [];
  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: config.temperature ?? 0.1,
      max_tokens: config.maxTokens ?? 2048,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Cerebras API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  return {
    text,
    modelUsed: model,
    provider: 'cerebras',
    latencyMs: Date.now() - start,
    tokensUsed: data.usage?.total_tokens,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 5: Sambanova (Fast large model hosting)
// Used for: Quiz banks, assessment generation
// Models: Meta-Llama-3.1-405B-Instruct, Meta-Llama-3.3-70B-Instruct
// ─────────────────────────────────────────────
export async function callSambanova(
  prompt: string,
  model: 'Meta-Llama-3.3-70B-Instruct' | 'Meta-Llama-3.1-405B-Instruct' = 'Meta-Llama-3.3-70B-Instruct',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();

  const messages: AIMessage[] = [];
  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SAMBANOVA_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: config.temperature ?? 0.1,
      max_tokens: config.maxTokens ?? 4096,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Sambanova API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  return {
    text,
    modelUsed: model,
    provider: 'sambanova',
    latencyMs: Date.now() - start,
    tokensUsed: data.usage?.total_tokens,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 6: OpenRouter (Universal fallback gateway)
// Used for: When all else fails — routes to best available
// Can also use specific models: anthropic/claude, openai/gpt-4o etc
// ─────────────────────────────────────────────
export async function callOpenRouter(
  prompt: string,
  model: string = 'google/gemini-flash-1.5',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();

  const messages: AIMessage[] = [];
  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_VERCEL_URL || 'https://pedagogy-master.vercel.app',
      'X-Title': 'Pedagogy Master',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: config.temperature ?? 0.1,
      max_tokens: config.maxTokens ?? 4096,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  return {
    text,
    modelUsed: model,
    provider: 'openrouter',
    latencyMs: Date.now() - start,
    tokensUsed: data.usage?.total_tokens,
  };
}
