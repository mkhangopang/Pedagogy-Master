// lib/ai-router.ts
// AI Provider Rotation — tries each provider in order on rate limit

const providers = [
  {
    name: 'gemini',
    available: !!process.env.GEMINI_API_KEY,
    call: async (prompt: string) => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );
      if (res.status === 429) throw { status: 429, provider: 'gemini' };
      if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
      const data = await res.json();
      return data.candidates[0].content.parts[0].text;
    }
  },
  {
    name: 'mistral',
    available: !!process.env.API_MISTRAL,
    call: async (prompt: string) => {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_MISTRAL}`
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (res.status === 429) throw { status: 429, provider: 'mistral' };
      if (!res.ok) throw new Error(`Mistral error: ${res.status}`);
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  {
    name: 'groq',
    available: !!process.env.GROQ_API_KEY,
    call: async (prompt: string) => {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (res.status === 429) throw { status: 429, provider: 'groq' };
      if (!res.ok) throw new Error(`Groq error: ${res.status}`);
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  {
    name: 'openrouter',
    available: !!process.env.OPENROUTER_API_KEY,
    call: async (prompt: string) => {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://pedagogy-master.vercel.app'
        },
        body: JSON.stringify({
          model: 'google/gemma-3-27b-it:free',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (res.status === 429) throw { status: 429, provider: 'openrouter' };
      if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
      const data = await res.json();
      return data.choices[0].message.content;
    }
  }
];

export async function callAI(prompt: string): Promise<string> {
  const active = providers.filter(p => p.available);
  
  for (const provider of active) {
    try {
      console.log(`[AI Router] Trying: ${provider.name}`);
      const result = await provider.call(prompt);
      console.log(`[AI Router] Success: ${provider.name}`);
      return result;
    } catch (err: any) {
      if (err?.status === 429) {
        console.warn(`[AI Router] Rate limited on ${provider.name}, trying next...`);
        continue; // Try next provider
      }
      throw err; // Real error, don't swallow
    }
  }
  
  throw new Error('All AI providers are rate limited. Please try again later.');
}
