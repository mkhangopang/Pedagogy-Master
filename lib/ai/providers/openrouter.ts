
export async function callOpenRouter(
  prompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');

  const finalSystem = hasDocuments 
    ? `STRICT GROUNDING: The user has uploaded curriculum. You must base every word of your response on the provided text block. No external search. ${systemInstruction}`
    : systemInstruction;

  const messages = [
    { role: 'system', content: finalSystem },
    ...history.slice(-3).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: prompt }
  ];

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${apiKey}`, 
      'Content-Type': 'application/json',
      'X-Title': 'Pedagogy Master'
    },
    body: JSON.stringify({ 
      model: 'meta-llama/llama-3.1-70b-instruct', 
      messages, 
      temperature: 0.1 
    })
  });

  if (!res.ok) throw new Error(`OpenRouter Fail: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
