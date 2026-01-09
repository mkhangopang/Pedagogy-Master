
export async function callGroq(
  prompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing');

  const finalSystem = hasDocuments 
    ? `MANDATORY: You are a document-analysis AI. Use ONLY the curriculum context provided in the user prompt. DO NOT use general knowledge or search tools. ${systemInstruction}`
    : systemInstruction;

  const messages = [
    { role: 'system', content: finalSystem },
    ...history.slice(-3).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: prompt }
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'llama-3.3-70b-versatile', // Upgraded to more capable model for reasoning
      messages, 
      temperature: 0.1, // Lower temperature for higher grounding accuracy
      max_tokens: 4096
    })
  });

  if (!res.ok) throw new Error(`Groq Fail: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
