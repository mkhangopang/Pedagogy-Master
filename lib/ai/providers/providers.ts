// lib/ai/providers.ts
// 8-ENGINE NEURAL GRID — Unified provider interface

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
// PROVIDER 1: Google Gemini
// Env: API_KEY
// ─────────────────────────────────────────────
export async function callGemini(
  prompt: string,
  model: 'gemini-2.5-pro-preview-06-05' | 'gemini-2.5-flash-preview-05-20' | 'gemini-2.0-flash-001' | 'gemini-2.0-flash',
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
// PROVIDER 2: DeepSeek
// Env: DEEPSEEK_API_KEY
// ─────────────────────────────────────────────
export async function callDeepSeek(
  prompt: string,
  model: 'deepseek-reasoner' | 'deepseek-chat' = 'deepseek-chat',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();
  const messages: AIMessage[] = [];
  if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, temperature: config.temperature ?? 0.1, max_tokens: config.maxTokens ?? 4096 })
  });

  if (!response.ok) throw new Error(`DeepSeek ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    modelUsed: model, provider: 'deepseek',
    latencyMs: Date.now() - start, tokensUsed: data.usage?.total_tokens,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 3: Groq
// Env: GROQ_API_KEY
// ─────────────────────────────────────────────
export async function callGroq(
  prompt: string,
  model: 'llama-3.3-70b-versatile' | 'llama-3.1-8b-instant' | 'mixtral-8x7b-32768' = 'llama-3.3-70b-versatile',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();
  const messages: AIMessage[] = [];
  if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, temperature: config.temperature ?? 0.1, max_tokens: config.maxTokens ?? 4096 })
  });

  if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    modelUsed: model, provider: 'groq',
    latencyMs: Date.now() - start, tokensUsed: data.usage?.total_tokens,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 4: Cerebras (fastest inference)
// Env: CEREBRAS_API_KEY
// ─────────────────────────────────────────────
export async function callCerebras(
  prompt: string,
  model: 'llama3.1-8b' | 'llama3.1-70b' = 'llama3.1-70b',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();
  const messages: AIMessage[] = [];
  if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, temperature: config.temperature ?? 0.1, max_tokens: config.maxTokens ?? 2048 })
  });

  if (!response.ok) throw new Error(`Cerebras ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    modelUsed: model, provider: 'cerebras',
    latencyMs: Date.now() - start, tokensUsed: data.usage?.total_tokens,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 5: Sambanova
// Env: SAMBANOVA_API_KEY
// ─────────────────────────────────────────────
export async function callSambanova(
  prompt: string,
  model: 'Meta-Llama-3.3-70B-Instruct' | 'Meta-Llama-3.1-405B-Instruct' = 'Meta-Llama-3.3-70B-Instruct',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();
  const messages: AIMessage[] = [];
  if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SAMBANOVA_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, temperature: config.temperature ?? 0.1, max_tokens: config.maxTokens ?? 4096 })
  });

  if (!response.ok) throw new Error(`Sambanova ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    modelUsed: model, provider: 'sambanova',
    latencyMs: Date.now() - start, tokensUsed: data.usage?.total_tokens,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 6: OpenRouter (universal fallback)
// Env: OPENROUTER_API_KEY
// ─────────────────────────────────────────────
export async function callOpenRouter(
  prompt: string,
  model: string = 'google/gemini-2.0-flash-001',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();
  const messages: AIMessage[] = [];
  if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_VERCEL_URL || 'https://pedagogy-master.vercel.app',
      'X-Title': 'Pedagogy Master',
    },
    body: JSON.stringify({ model, messages, temperature: config.temperature ?? 0.1, max_tokens: config.maxTokens ?? 4096 })
  });

  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    modelUsed: model, provider: 'openrouter',
    latencyMs: Date.now() - start, tokensUsed: data.usage?.total_tokens,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 7: AI Gateway (Cloudflare)
// Env: AI_GATEWAY_API_KEY
// ─────────────────────────────────────────────
export async function callAIGateway(
  prompt: string,
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY not set');

  const messages: AIMessage[] = [];
  if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const gatewayUrl = process.env.AI_GATEWAY_URL ||
    'https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT/YOUR_GATEWAY/google-ai-studio/v1/chat/completions';

  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gemini-2.0-flash', messages, temperature: config.temperature ?? 0.1, max_tokens: config.maxTokens ?? 4096 })
  });

  if (!response.ok) throw new Error(`AI Gateway ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    modelUsed: 'gemini-2.0-flash-gateway', provider: 'ai-gateway',
    latencyMs: Date.now() - start, tokensUsed: data.usage?.total_tokens,
  };
}

// ─────────────────────────────────────────────
// PROVIDER 8: Mistral AI ← NEW
// Env: API_MISTRAL  (NOT "MISTRAL_API_KEY")
// Best for: Rubrics, SLO JSON parsing, structured output
// ─────────────────────────────────────────────
export async function callMistral(
  prompt: string,
  model: 'mistral-large-latest' | 'mistral-small-latest' | 'open-mistral-nemo' = 'mistral-large-latest',
  config: AIRequestConfig = {}
): Promise<AIResponse> {
  const start = Date.now();
  const apiKey = process.env.API_MISTRAL;
  if (!apiKey) throw new Error('API_MISTRAL not set in environment variables');

  const messages: AIMessage[] = [];
  if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: config.temperature ?? 0.1,
      max_tokens: config.maxTokens ?? 4096,
    })
  });

  if (!response.ok) throw new Error(`Mistral ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    modelUsed: model,
    provider: 'mistral',
    latencyMs: Date.now() - start,
    tokensUsed: data.usage?.total_tokens,
  };
}
