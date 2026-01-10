
export async function callSambaNova(
  fullPrompt: string,
  history: any[],
  systemInstruction: string,
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.SAMBANOVA_API_KEY;
  if (!apiKey) throw new Error('SAMBANOVA_API_KEY missing');

  const finalSystem = hasDocuments 
    ? "STRICT_LONG_CONTEXT_ANALYZER: Prioritize provided documents. Use ONLY provided text. No bold headings. Temp 0.0."
    : systemInstruction;

  const messages = [
    { role: 'system', content: finalSystem },
    ...history.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: fullPrompt }
  ];

  const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'Meta-Llama-3.1-8B-Instruct',
      messages, 
      temperature: hasDocuments ? 0.0 : 0.7,
      max_tokens: 4096
    })
  });

  if (!res.ok) throw new Error(`SambaNova Node Failure: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
