import { GoogleGenAI } from "@google/genai";
import { kv } from "../kv";
import { performanceMonitor } from "../monitoring/performance";
import { Buffer } from "buffer";

export interface ModelConfig {
  name: 'gemini' | 'grok' | 'cerebras' | 'deepseek' | 'sambanova';
  apiKey: string;
  endpoint: string;
  tokenLimit: number;
  tokensUsed: number;
  lastReset: string;
  enabled: boolean;
  modelId: string;
}

export type TaskType = 'pdf_parse' | 'code_gen' | 'rag_query' | 'summarize' | 'web_search' | 'embedding';

interface TaskRouting {
  primary: string;
  fallbacks: string[];
  tokenThreshold: number;
}

const ROUTING_TABLE: Record<TaskType, TaskRouting> = {
  pdf_parse: { primary: 'gemini', fallbacks: ['deepseek', 'grok'], tokenThreshold: 30000 },
  code_gen: { primary: 'deepseek', fallbacks: ['gemini', 'cerebras'], tokenThreshold: 15000 },
  rag_query: { primary: 'cerebras', fallbacks: ['gemini', 'deepseek'], tokenThreshold: 4000 },
  summarize: { primary: 'sambanova', fallbacks: ['gemini', 'cerebras'], tokenThreshold: 10000 },
  web_search: { primary: 'grok', fallbacks: ['gemini'], tokenThreshold: 5000 },
  embedding: { primary: 'cerebras', fallbacks: ['gemini'], tokenThreshold: 2000 }
};

export class ModelOrchestrator {
  private async getUsage(modelName: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const key = `usage:${modelName}:${today}`;
    const val = await kv.get<number>(key);
    return val || 0;
  }

  private async trackUsage(modelName: string, tokens: number) {
    const today = new Date().toISOString().split('T')[0];
    const key = `usage:${modelName}:${today}`;
    const current = await this.getUsage(modelName);
    await kv.set(key, current + tokens, 86400); // 1 day TTL
  }

  async selectModel(taskType: TaskType, contextSize: number): Promise<string> {
    const route = ROUTING_TABLE[taskType];
    const primaryUsage = await this.getUsage(route.primary);
    
    // Limits based on free tier daily estimates
    const limits: Record<string, number> = {
      gemini: 50000,
      grok: 100000,
      cerebras: 200000,
      deepseek: 50000,
      sambanova: 150000
    };

    if (primaryUsage < limits[route.primary] * 0.9) {
      return route.primary;
    }

    for (const fallback of route.fallbacks) {
      const usage = await this.getUsage(fallback);
      if (usage < limits[fallback] * 0.9) return fallback;
    }

    return route.primary; // Hard fallback to primary if all exhausted
  }

  async executeTask(taskType: TaskType, prompt: string, options: any = {}): Promise<string> {
    const start = Date.now();
    const modelName = await this.selectModel(taskType, prompt.length);
    let result = "";

    try {
      if (modelName === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const res = await ai.models.generateContent({
          model: options.complexity >= 3 ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { 
            temperature: options.temperature || 0.1,
            systemInstruction: options.systemInstruction
          }
        });
        result = res.text || "";
      } else {
        const endpoint = process.env[`${modelName.toUpperCase()}_ENDPOINT`];
        const apiKey = process.env[`${modelName.toUpperCase()}_API_KEY`];
        const modelId = modelName === 'cerebras' ? 'llama3.1-70b' : 
                        modelName === 'deepseek' ? 'deepseek-reasoner' :
                        modelName === 'sambanova' ? 'Meta-Llama-3.1-70B-Instruct' : 'grok-beta';

        const res = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${apiKey}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: 'system', content: options.systemInstruction || 'You are an educational assistant.' },
              { role: 'user', content: prompt }
            ],
            temperature: options.temperature || 0.1
          })
        });

        if (!res.ok) throw new Error(`${modelName} node refusal: ${res.status}`);
        const data = await res.json();
        result = data.choices[0].message.content;
      }

      const estimatedTokens = Math.ceil((prompt.length + result.length) / 4);
      await this.trackUsage(modelName, estimatedTokens);
      performanceMonitor.track(`orchestrator_${taskType}`, Date.now() - start, { model: modelName });
      
      return result;
    } catch (err: any) {
      console.error(`Orchestrator failure [${modelName}]:`, err.message);
      // Attempt next fallback in chain if primary fails
      throw err; 
    }
  }
}

export const orchestrator = new ModelOrchestrator();