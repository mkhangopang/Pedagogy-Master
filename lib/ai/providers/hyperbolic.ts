
export async function callHyperbolic(
  fullPrompt: string,
  history: any[],
  systemInstruction: string,
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.HYPERBOLIC_API_KEY;
  if (!apiKey) throw new Error('HYPERBOLIC_API_KEY missing');

  const finalSystem = hasDocuments 
    ? "STRICT_GROUNDING: Use only provided assets. No general knowledge. No bold headings. Temp 0.0."
    : systemInstruction;

  const messages = [
    { role: 'system', content: finalSystem },
    ...history.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: fullPrompt }
  ];

  const res = await fetch('https://api.hyperbolic.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      messages, 
      temperature: hasDocuments ? 0.0 : 0.7,
      max_tokens: 4096
    })
  });

  if (!res.ok) throw new Error(`Hyperbolic Node Failure: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
