export async function callCerebras(
  fullPrompt: string,
  history: any[],
  systemInstruction: string,
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error('CEREBRAS_API_KEY missing');

  // Using the 70B model for higher reasoning quality if possible, falling back to 8B internally by Cerebras
  const modelName = 'llama3.1-70b';

  const finalSystem = hasDocuments 
    ? "STRICT_ASSET_MODE: Use only provided curriculum documents. No bold headings. Temp 0.0."
    : systemInstruction;

  const messages = [
    { role: 'system', content: finalSystem },
    ...history.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: fullPrompt }
  ];

  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: modelName,
      messages, 
      temperature: hasDocuments ? 0.0 : 0.7,
      max_tokens: 4096
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Cerebras Node Failure: ${res.status} - ${err.error?.message || 'Bad Request'}`);
  }
  
  const data = await res.json();
  return data.choices[0].message.content;
}