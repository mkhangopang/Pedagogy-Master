import { GoogleGenAI } from "@google/genai";

/**
 * NEURAL TEXT SANITIZER
 * Ensures input strings don't crash the embedding node.
 */
function sanitizeText(text: string): string {
  if (!text) return " ";
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ') 
    .replace(/\\u[0-9a-fA-F]{4}/g, '') 
    .normalize('NFKD')
    .replace(/[^\x20-\x7E\s]/g, '') 
    .replace(/\s+/g, ' ')
    .trim() || " ";
}

/**
 * VECTOR SYNTHESIS ENGINE (v21.0)
 * MODEL: text-embedding-004 (768 dimensions)
 * CRITICAL: This MUST be consistent between indexing and query.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("❌ [Embedding Node] API_KEY missing.");
    return [];
  }

  const cleanText = sanitizeText(text);

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Correct format according to system guidelines
    const response = await ai.models.embedContent({
      model: "text-embedding-004", 
      contents: { parts: [{ text: cleanText }] } 
    });

    const result = response.embedding;
    if (!result?.values) throw new Error("Invalid vector response.");

    const vector = result.values;

    // Enforce 768d dimensionality
    if (vector.length !== 768) {
      console.warn(`[Embedder] Dimension mismatch: expected 768, got ${vector.length}. Padding...`);
      if (vector.length < 768) {
        return [...vector, ...new Array(768 - vector.length).fill(0)];
      }
      return vector.slice(0, 768);
    }
    
    return vector;
  } catch (error: any) {
    console.error('[Embedding Error]:', error.message);
    return [];
  }
}

/**
 * Generate embeddings for multiple texts in batches.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  // We process sequentially to ensure reliability on edge nodes
  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    if (embedding.length === 768) {
      embeddings.push(embedding);
    } else {
      console.warn('Skipping invalid embedding for chunk.');
      embeddings.push(new Array(768).fill(0)); // Fallback
    }
  }
  
  return embeddings;
}
