
export async function callOpenRouter(prompt: string, history: any[], systemInstruction: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.slice(-5).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: prompt }
  ];

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${apiKey}`, 
      'Content-Type': 'application/json',
      'X-Title': 'Pedagogy Master'
    },
    body: JSON.stringify({ model: 'openai/gpt-3.5-turbo', messages, temperature: 0.7 })
  });

  if (!res.ok) throw new Error(`OpenRouter Fail: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
