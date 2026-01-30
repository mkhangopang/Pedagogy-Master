export async function callSambaNova(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.SAMBANOVA_API_KEY;
  if (!apiKey) throw new Error('SAMBANOVA_API_KEY missing');

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: fullPrompt }
  ];

  try {
    const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        // Updated model ID to standard cloud identifier
        model: 'Meta-Llama-3.1-70B-Instruct',
        messages, 
        temperature: 0.1, 
        max_tokens: 4096
      })
    });

    if (!res.ok) {
      if (res.status === 410) throw new Error("SambaNova model deprecated (410).");
      throw new Error(`SambaNova fault: ${res.status}`);
    }
    
    const data = await res.json();
    return data.choices[0].message.content;
  } catch (err: any) {
    console.warn("[SambaNova Adapter] Fault caught:", err.message);
    throw err;
  }
}