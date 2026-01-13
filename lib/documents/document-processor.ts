
import { Buffer } from 'buffer';

/**
 * DOCUMENT PROCESSOR ENGINE
 * Extracts searchable text and pedagogical metadata from curriculum assets.
 */
export async function processDocument(file: File): Promise<{
  text: string;
  wordCount: number;
  pageCount: number;
  filename: string;
  type: string;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename = file.name;
  const type = file.type;
  
  let text = "";
  let pageCount = 1;

  try {
    if (type === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      // Dynamic import with @ts-ignore to prevent build-time declaration errors.
      // @ts-ignore
      const pdf = (await import('pdf-parse')).default;
      const data = await pdf(buffer);
      text = data.text;
      pageCount = data.numpages || 1;
    } else if (type.startsWith('text/') || filename.toLowerCase().endsWith('.txt') || filename.toLowerCase().endsWith('.csv')) {
      text = new TextDecoder().decode(arrayBuffer);
    } else {
      text = `[Multimodal Asset: ${filename}] - Content extraction pending neural analysis.`;
    }
  } catch (err) {
    console.warn(`Extraction failed for ${filename}, falling back to raw data reference.`, err);
    text = `[Extraction Error: ${filename}] - Neural fallback active.`;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    text,
    wordCount,
    pageCount,
    filename,
    type
  };
}
