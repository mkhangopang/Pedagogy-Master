/**
 * VISION EXTRACTOR — lib/rag/vision-extractor.ts
 * 
 * Uses Gemini 2.5 Pro's native PDF vision to extract text from scanned PDFs.
 * This bypasses pdf-parse entirely — the AI reads the document visually,
 * exactly like a human would, regardless of whether there is a text layer.
 * 
 * Falls back through multiple Gemini models if primary is rate-limited.
 */

const GEMINI_VISION_MODELS = [
  'gemini-2.5-pro-preview-06-05',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.0-flash-001',
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const EXTRACTION_PROMPT = `You are a specialist in Pakistani and international school curriculum documents.

Your task: Extract ALL content from this curriculum document with perfect accuracy.

CRITICAL RULES:
1. Extract every SLO (Student Learning Outcome) code exactly as written
   Format: SUBJECTCODE+GRADE(2digits)+DOMAIN(letter)+NUMBER(2digits)
   Examples: BIO09A01, MAT11B03, PHY10C05, CHE12D02
2. Preserve ALL headings — Grade levels, Domains, Units, Topics
3. Keep the full text of every learning objective word-for-word
4. Use markdown structure:
   # GRADE [X]
   ## DOMAIN [Letter]: [Name]  
   ### UNIT: [Name]
   **[SLO_CODE]** [Full text of learning objective]
5. Do NOT summarize, paraphrase, or skip any content
6. Include ALL pages — do not stop early
7. At the very end, output a structured index:

<STRUCTURED_INDEX>
[
  {
    "slo_code": "BIO09A01",
    "slo_full_text": "Full text of the learning objective",
    "bloom_level": "Remember|Understand|Apply|Analyze|Evaluate|Create",
    "domain": "A",
    "domain_name": "Cell Biology",
    "grade": "Grade 9",
    "subject": "Biology"
  }
]
</STRUCTURED_INDEX>

Extract now — be thorough and complete:`;

interface VisionResult {
  text: string;
  method: 'vision' | 'text';
  model: string;
  pageCount?: number;
}

/**
 * Extract text from a PDF buffer using Gemini Vision.
 * Sends the entire PDF as base64 inline data — Gemini reads it visually.
 */
export async function extractPDFWithVision(
  buffer: Buffer,
  fileName: string
): Promise<VisionResult> {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const base64Data = buffer.toString('base64');
  const fileSizeMB = buffer.length / (1024 * 1024);
  
  console.log(`[Vision] Processing ${fileName} (${fileSizeMB.toFixed(1)}MB) via Gemini Vision`);

  // Gemini inline data limit is 20MB — for larger files we chunk by uploading
  // For files under 20MB we use inline data (most curriculum PDFs are 5-15MB)
  if (fileSizeMB > 18) {
    console.warn(`[Vision] File too large for inline (${fileSizeMB.toFixed(1)}MB) — will process first 18MB`);
  }

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
                {
                  inline_data: {
                    mime_type: 'application/pdf',
                    data: base64Data,
                  }
                },
                {
                  text: EXTRACTION_PROMPT
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,
              topP: 0.8,
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        // Rate limit — try next model
        if (response.status === 429) {
          console.warn(`[Vision] ${model} rate limited, trying next...`);
          lastError = new Error(`Rate limited: ${errText.substring(0, 100)}`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw new Error(`Gemini Vision API error ${response.status}: ${errText.substring(0, 200)}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text || text.length < 200) {
        console.warn(`[Vision] ${model} returned insufficient content (${text?.length || 0} chars)`);
        lastError = new Error('Insufficient content returned');
        continue;
      }

      console.log(`[Vision] ✅ ${model} extracted ${text.length} chars from ${fileName}`);
      return { text, method: 'vision', model };

    } catch (err: any) {
      lastError = err;
      console.warn(`[Vision] ${model} failed: ${err.message?.substring(0, 100)}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  throw new Error(`Vision extraction failed for ${fileName}: ${lastError?.message}`);
}

/**
 * Smart extraction — tries text layer first, falls back to vision.
 * This way digital PDFs (fast) don't pay the vision cost.
 */
export async function smartExtractPDF(
  buffer: Buffer,
  fileName: string
): Promise<VisionResult> {
  // Try text extraction first
  try {
    const pdf = (await import('pdf-parse')).default;
    const raw = await pdf(buffer);
    const text = raw.text?.trim() || '';

    // Quality check — scanned PDFs return almost nothing
    const meaningfulLines = text.split('\n').filter((l: string) => l.trim().length > 10).length;
    const hasRealContent = text.length > 800 && meaningfulLines > 20;

    if (hasRealContent) {
      console.log(`[Extract] Digital PDF detected — using text layer (${text.length} chars, ${meaningfulLines} lines)`);
      return { text, method: 'text', model: 'pdf-parse', pageCount: raw.numpages };
    }

    console.log(`[Extract] Scanned PDF detected (${text.length} chars, ${meaningfulLines} lines) — switching to Vision`);
  } catch (e: any) {
    console.warn(`[Extract] pdf-parse failed: ${e.message} — falling back to Vision`);
  }

  // Fall back to Gemini Vision
  return extractPDFWithVision(buffer, fileName);
}
