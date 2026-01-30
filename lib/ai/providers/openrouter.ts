export async function callOpenRouter(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('Neural Node Error: OpenRouter/AI_GATEWAY key missing');

  const finalSystem = hasDocuments 
    ? "STRICT_ASSET_GROUNDING: Read the <ASSET_VAULT> in the prompt. Use ONLY vault text. Use verbatim SLO codes like B-09-A-01. Do not skip numbering. No conversational filler."
    : systemInstruction;

  const messages = [
    { role: 'system', content: finalSystem },
    ...history.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: fullPrompt }
  ];

  // Using a high-context reasoning model specifically for ingestion
  const model = hasDocuments ? 'meta-llama/llama-3.3-70b-instruct' : 'google/gemini-2.0-flash-001';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${apiKey}`, 
      'Content-Type': 'application/json',
      'X-Title': 'EduNexus Ingestion Node'
    },
    body: JSON.stringify({ 
      model, 
      messages, 
      temperature: hasDocuments ? 0.0 : 0.7, 
      // FIX: Reduced to 4000 to avoid 402 "Insufficient Credits" for large reservations
      max_tokens: 4000,
      top_p: 1
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    if (res.status === 402) {
      throw new Error(`OpenRouter_402: Insufficient credits for high-token reservation. Switching node...`);
    }
    throw new Error(`OpenRouter Node Failure: ${res.status} ${errData.error?.message || ''}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}