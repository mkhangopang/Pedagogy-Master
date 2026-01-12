/**
 * PEDAGOGICAL CHUNKING ENGINE
 * Splits documents into overlapping, meaningful units focused on curriculum standards.
 */

export interface DocumentChunk {
  text: string;
  index: number;
  type: 'slo' | 'teaching' | 'assessment' | 'general';
  sloMentioned: string[];
  keywords: string[];
  pageNumber?: number;
  sectionTitle?: string;
}

/**
 * Main chunking function
 */
export function chunkDocument(documentText: string): DocumentChunk[] {
  console.log(`📄 [Chunking] Starting high-fidelity pedagogical chunking...`);
  
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;
  
  // STRATEGY 1: Extract SLO-specific chunks (PRIORITY)
  // Matches patterns like S8a5, 8.1.2, G-IV-A, etc.
  const sloPattern = /\b([A-Z])?(\d{1,2})([a-z])?(\d{1,2})[:\s-]+([^.]+\.)/gi;
  let match;
  
  while ((match = sloPattern.exec(documentText)) !== null) {
    const rawMatch = match[0];
    const sloCode = rawMatch.split(/[:\s-]/)[0].toUpperCase();
    
    // Provide 200 chars prefix and 800 chars suffix for context
    const startPos = Math.max(0, match.index - 200);
    const endPos = Math.min(documentText.length, match.index + 800);
    
    chunks.push({
      text: documentText.substring(startPos, endPos).trim(),
      index: chunkIndex++,
      type: 'slo',
      sloMentioned: [sloCode],
      keywords: extractKeywords(documentText.substring(startPos, endPos)),
    });
  }
  
  // STRATEGY 2: Sliding Window for conceptual coverage
  const words = documentText.split(/\s+/);
  const wordsPerChunk = 400;
  const overlap = 100;
  
  for (let i = 0; i < words.length; i += (wordsPerChunk - overlap)) {
    const chunkWords = words.slice(i, i + wordsPerChunk);
    const chunkText = chunkWords.join(' ');
    
    if (chunkText.length < 150) continue; 
    
    const mentionedSLOs = extractSLOCodes(chunkText);
    
    chunks.push({
      text: chunkText.trim(),
      index: chunkIndex++,
      type: determineChunkType(chunkText),
      sloMentioned: mentionedSLOs,
      keywords: extractKeywords(chunkText),
    });
  }
  
  console.log(`✅ [Chunking] Generated ${chunks.length} segments`);
  return chunks;
}

function determineChunkType(text: string): 'slo' | 'teaching' | 'assessment' | 'general' {
  const lower = text.toLowerCase();
  if (/\b(slo|standard|outcome|objective|competency)\b/i.test(lower)) return 'slo';
  if (/\b(strategy|activity|teaching|method|pedagogy|lesson)\b/i.test(lower)) return 'teaching';
  if (/\b(assess|quiz|test|exam|evaluate|rubric)\b/i.test(lower)) return 'assessment';
  return 'general';
}

function extractSLOCodes(text: string): string[] {
  // Broad pattern for various curriculum codes
  const pattern = /\b([A-Z]\d{1,2}[a-z]\d{1,2}|[A-Z]-\d{1,2}-\d{1,2}|\d\.\d\.\d)\b/gi;
  const matches = Array.from(text.matchAll(pattern));
  return Array.from(new Set(matches.map(m => m[0].toUpperCase())));
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'this', 'that', 'they', 'from'
  ]);
  
  const words = text
    .toLowerCase()
    .match(/\b[a-z]{4,}\b/g) || [];
  
  const filtered = words.filter(w => !stopWords.has(w));
  const unique = Array.from(new Set(filtered));
  return unique.slice(0, 12);
}
