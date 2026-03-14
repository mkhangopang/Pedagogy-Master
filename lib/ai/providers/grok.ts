
export async function callGrok(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.GROK_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('GROK_API_KEY missing');

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: fullPrompt }
  ];

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'grok-2-1212',
      messages, 
      temperature: hasDocuments ? 0.0 : 0.7,
      max_tokens: 4096
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`Grok Node Failure: ${res.status} ${errData.error?.message || ''}`);
  }
  
  const data = await res.json();
  return data.choices[0].message.content;
}
