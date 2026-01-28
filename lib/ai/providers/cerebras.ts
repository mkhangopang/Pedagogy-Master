export async function callCerebras(
  fullPrompt: string,
  history: any[],
  systemInstruction: string,
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error('CEREBRAS_API_KEY missing');

  // fallback to llama3.1-8b if 70b isn't working for the tier
  const modelName = 'llama3.1-8b';

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: fullPrompt }
  ];

  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: modelName,
      messages, 
      temperature: 0.1,
      max_tokens: 2048
    })
  });

  if (!res.ok) {
    throw new Error(`Cerebras segment fault: ${res.status}`);
  }
  
  const data = await res.json();
  return data.choices[0].message.content || "";
}