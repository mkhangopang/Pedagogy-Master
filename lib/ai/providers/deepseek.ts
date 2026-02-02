
export async function callDeepSeek(
  fullPrompt: string,
  history: any[],
  systemInstruction: string,
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.slice(-6).map(m => ({ 
      role: m.role === 'user' ? 'user' : 'assistant', 
      content: m.content 
    })),
    { role: 'user', content: fullPrompt }
  ];

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'deepseek-chat',
      messages, 
      temperature: hasDocuments ? 0.0 : 0.7,
      max_tokens: 4096
    })
  });

  if (!res.ok) throw new Error(`DeepSeek Node Failure: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
