const GEMINI_VISION_MODELS = [
  'gemini-2.0-flash-001',
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const EXTRACTION_PROMPT = `You are reading a school curriculum document. Extract ALL text faithfully.
- Copy every learning objective and code exactly as written
- Preserve all headings, grade levels, domain letters
- Extract from ALL pages, do not stop early
Start extracting now:`;

export interface VisionResult {
  text: string;
  method: 'vision' | 'text';
  model: string;
  charCount: number;
}

export async function extractPDFWithVision(buffer: Buffer, fileName: string): Promise<VisionResult> {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key.');
  const base64Data = buffer.toString('base64');
  for (const model of GEMINI_VISION_MODELS) {
    try {
      const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: 'application/pdf', data: base64Data } },
            { text: EXTRACTION_PROMPT }
          ]}],
          generationConfig: { temperature: 0.05, maxOutputTokens: 8192 },
        })
      });
      if (!response.ok) continue;
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text.length > 200) return { text, method: 'vision', model, charCount: text.length };
    } catch (e) { continue; }
  }
  throw new Error(`Vision extraction failed for ${fileName}`);
}

export async function smartExtractPDF(buffer: Buffer, fileName: string): Promise<VisionResult> {
  try {
    const pdf = (await import('pdf-parse')).default;
    const raw = await pdf(buffer);
    const text = raw.text?.trim() || '';
    const meaningfulLines = text.split('\n').filter((l: string) => l.trim().length > 15).length;
    if (text.length > 1000 && meaningfulLines > 30) {
      return { text, method: 'text', model: 'pdf-parse', charCount: text.length };
    }
  } catch (e) { }
  return extractPDFWithVision(buffer, fileName);
}

