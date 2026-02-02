
export async function callOpenAI(
  fullPrompt: string,
  history: any[],
  systemInstruction: string,
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.slice(-10).map(m => ({ 
      role: m.role === 'user' ? 'user' : 'assistant', 
      content: m.content 
    })),
    { role: 'user', content: fullPrompt }
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'gpt-4o', 
      messages, 
      temperature: hasDocuments ? 0.0 : 0.7,
      max_tokens: 4096
    })
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(`OpenAI Node Failure: ${res.status} ${error.error?.message || ''}`);
  }
  
  const data = await res.json();
  return data.choices[0].message.content || "";
}
