
export async function callOpenRouter(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');

  const finalSystem = hasDocuments 
    ? "STRICT_GROUNDING: Act as a literal document reader. Use ONLY the provided curriculum vault. Temperature 0.0. No guessing. No search."
    : systemInstruction;

  const messages = [
    { role: 'system', content: finalSystem },
    ...history.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: fullPrompt }
  ];

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${apiKey}`, 
      'Content-Type': 'application/json',
      'X-Title': 'Pedagogy Master (Grounded)'
    },
    body: JSON.stringify({ 
      model: 'meta-llama/llama-3.3-70b-instruct', 
      messages, 
      temperature: 0.0, // Force strict factual adherence
      max_tokens: 4096,
      top_p: 1
    })
  });

  if (!res.ok) throw new Error(`OpenRouter Node Failure: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
