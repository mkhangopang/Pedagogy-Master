
export async function callGroq(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing');

  const finalSystem = hasDocuments 
    ? "You are a curriculum-aware AI tutor. You have access to uploaded curriculum documents provided in the user prompt. Use ONLY that text. DO NOT search the web. DO NOT use general knowledge. Be precise and literal."
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
      model: 'llama-3.3-70b-versatile', // Upgraded to more capable model for reasoning
      messages, 
      temperature: 0.1, // Near zero for strict grounding
      max_tokens: 4096,
      top_p: 1
    })
  });

  if (!res.ok) throw new Error(`Groq Node Error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
