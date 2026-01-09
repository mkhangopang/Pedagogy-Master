
export async function callOpenRouter(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');

  const finalSystem = hasDocuments 
    ? "STRICT GROUNDING: You are a document analysis tool. The user provided curriculum text. You must ONLY use that text. No web search. No outside knowledge."
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
      'X-Title': 'Pedagogy Master'
    },
    body: JSON.stringify({ 
      model: 'meta-llama/llama-3.1-70b-instruct', 
      messages, 
      temperature: 0.1, // Minimum temperature for accuracy
      max_tokens: 4096
    })
  });

  if (!res.ok) throw new Error(`OpenRouter Node Error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
