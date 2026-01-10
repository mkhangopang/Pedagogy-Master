
export async function callGroq(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing');

  const finalSystem = hasDocuments 
    ? "STRICT_DOCUMENT_ONLY_MODE: Use ONLY the <ASSET_VAULT> in the prompt. Do not use general knowledge. No web search. Temperature 0.0."
    : systemInstruction;

  const messages = [
    { role: 'system', content: finalSystem },
    ...history.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: fullPrompt }
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'llama-3.3-70b-versatile',
      messages, 
      temperature: hasDocuments ? 0.0 : 0.7,
      max_tokens: 4096,
      top_p: 1
    })
  });

  if (!res.ok) throw new Error(`Groq Node Failure: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
