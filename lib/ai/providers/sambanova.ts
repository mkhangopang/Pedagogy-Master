export async function callSambaNova(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.SAMBANOVA_API_KEY;
  if (!apiKey) throw new Error('SAMBANOVA_API_KEY missing');

  // CRITICAL FIX: Avoid over-constraining the system prompt which causes Llama collapse.
  const finalSystem = hasDocuments 
    ? "You are a professional educational curriculum analyzer. Read the provided vault content carefully. Answer only based on the vault content provided in the prompt. If information is missing, say so clearly. Do not output gibberish or random tokens."
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
      model: 'Meta-Llama-3.1-70B-Instruct',
      messages, 
      temperature: 0.1, 
      max_tokens: 4096
    })
  });

  if (!res.ok) throw new Error(`SambaNova Node Failure: ${res.status}`);
  const data = await res.json();
  const responseText = data.choices[0].message.content;

  // Sanity check to catch token loops
  if (responseText.length > 500 && /^[A-Za-z\.\s\d]+$/.test(responseText.substring(0, 100)) === false) {
    throw new Error("Neural Node output integrity check failed.");
  }

  return responseText;
}