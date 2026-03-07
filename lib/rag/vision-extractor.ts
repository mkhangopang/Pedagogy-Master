/**
 * VISION EXTRACTOR v2.0 — lib/rag/vision-extractor.ts
 * 
 * FIX from v1: Removed SLO format examples from extraction prompt.
 * Examples were causing Gemini to output the example AS the data.
 * Now: pure extraction only, no format hints that confuse the model.
 */

const GEMINI_VISION_MODELS = [
  'gemini-2.5-pro-preview-06-05',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.0-flash-001',
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// CRITICAL: No examples in this prompt — examples caused AI to echo them back as data
const EXTRACTION_PROMPT = `You are reading a school curriculum document. Your job is to extract ALL text faithfully.

INSTRUCTIONS:
- Copy every learning objective, standard, and code exactly as written in the document
- Preserve all section headings, grade levels, domain letters, unit names
- Use markdown: # for grade headings, ## for domains, ### for units
- Write each learning objective on its own line, preceded by its code
- Extract from ALL pages — do not stop early or summarize
- Do NOT add any explanation, commentary, or formatting that is not in the original

Start extracting now, beginning from page 1:`;

export interface VisionResult {
  text: string;
  method: 'vision' | 'text';
  model: string;
  charCount: number;
}

export async function extractPDFWithVision(
  buffer: Buffer,
  fileName: string
): Promise<VisionResult> {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key. Set API_KEY or GEMINI_API_KEY.');

  const base64Data = buffer.toString('base64');
  const fileSizeMB = buffer.length / (1024 * 1024);
  console.log(`[Vision] ${fileName} (${fileSizeMB.toFixed(1)}MB) — starting vision extraction`);

  let lastError: Error | null = null;

  for (const model of GEMINI_VISION_MODELS) {
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: 'application/pdf', data: base64Data } },
                { text: EXTRACTION_PROMPT }
              ]
            }],
            generationConfig: {
              temperature: 0.05,
              maxOutputTokens: 8192,
              topP: 0.95,
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429 || response.status === 503) {
          console.warn(`[Vision] ${model} ${response.status} — trying next`);
          lastError = new Error(`${response.status}: ${errText.substring(0, 100)}`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        throw new Error(`Gemini ${response.status}: ${errText.substring(0, 200)}`);
      }

      const data = await response.json();
      if (data?.candidates?.[0]?.finishReason === 'SAFETY') {
        lastError = new Error('Safety filter');
        continue;
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text.length < 200) {
        console.warn(`[Vision] ${model} only ${text.length} chars — trying next`);
        lastError = new Error(`Only ${text.length} chars returned`);
        continue;
      }

      console.log(`[Vision] ✅ ${model} — ${text.length} chars extracted from ${fileName}`);
      return { text, method: 'vision', model, charCount: text.length };

    } catch (err: any) {
      lastError = err;
      console.warn(`[Vision] ${model} failed: ${err.message?.substring(0, 80)}`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  throw new Error(`All vision models failed for "${fileName}". Last error: ${lastError?.message}`);
}

export async function smartExtractPDF(
  buffer: Buffer,
  fileName: string
): Promise<VisionResult> {
  // Try text layer first — fast and free for digital PDFs
  try {
    const pdf = (await import('pdf-parse')).default;
    const raw = await pdf(buffer);
    const text = raw.text?.trim() || '';
    const meaningfulLines = text.split('\n').filter((l: string) => l.trim().length > 15).length;
    const hasRealContent = text.length > 1000 && meaningfulLines > 30;

    if (hasRealContent) {
      console.log(`[Extract] Digital PDF — ${text.length} chars, ${meaningfulLines} lines`);
      return { text, method: 'text', model: 'pdf-parse', charCount: text.length };
    }
    console.log(`[Extract] Scanned PDF (${text.length} chars, ${meaningfulLines} lines) — using Vision`);
  } catch (e: any) {
    console.warn(`[Extract] pdf-parse failed: ${e.message} — using Vision`);
  }

  return extractPDFWithVision(buffer, fileName);
}
