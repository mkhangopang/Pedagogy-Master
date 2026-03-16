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
    
    // Expand to paragraph boundaries for better context
    const { text: paragraphText } = expandToParagraph(documentText, match.index);
    
    chunks.push({
      text: paragraphText.trim(),
      index: chunkIndex++,
      type: 'slo',
      sloMentioned: [sloCode],
      keywords: extractKeywords(paragraphText),
    });
  }
  
  // STRATEGY 2: Sentence-Aware Sliding Window for conceptual coverage
  const sentences = splitIntoSentences(documentText);
  const targetChunkSize = 1200; // characters
  const overlapSize = 300; // characters
  
  let currentChunk: string[] = [];
  let currentLength = 0;
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    currentChunk.push(sentence);
    currentLength += sentence.length;
    
    if (currentLength >= targetChunkSize || i === sentences.length - 1) {
      const chunkText = currentChunk.join(' ');
      if (chunkText.length > 150) {
        const mentionedSLOs = extractSLOCodes(chunkText);
        chunks.push({
          text: chunkText.trim(),
          index: chunkIndex++,
          type: determineChunkType(chunkText),
          sloMentioned: mentionedSLOs,
          keywords: extractKeywords(chunkText),
        });
      }
      
      // Overlap: keep last few sentences that fit in overlapSize
      let overlapChunk: string[] = [];
      let overlapLen = 0;
      for (let j = currentChunk.length - 1; j >= 0; j--) {
        if (overlapLen + currentChunk[j].length <= overlapSize) {
          overlapChunk.unshift(currentChunk[j]);
          overlapLen += currentChunk[j].length;
        } else {
          break;
        }
      }
      currentChunk = overlapChunk;
      currentLength = overlapLen;
    }
  }
  
  console.log(`✅ [Chunking] Generated ${chunks.length} segments`);
  return chunks;
}

function splitIntoSentences(text: string): string[] {
  // Simple but effective sentence splitter
  return text
    .replace(/([.?!])\s+(?=[A-Z])/g, "$1|")
    .split("|")
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function expandToParagraph(text: string, index: number): { text: string, start: number, end: number } {
  // Find start of paragraph (double newline or start of text)
  let start = text.lastIndexOf('\n\n', index);
  if (start === -1) start = 0; else start += 2;
  
  // Find end of paragraph (double newline or end of text)
  let end = text.indexOf('\n\n', index);
  if (end === -1) end = text.length;
  
  // Safety: if paragraph is too large (> 2000 chars), cap it around the index
  if (end - start > 2000) {
    start = Math.max(start, index - 500);
    end = Math.min(end, index + 1500);
  }
  
  // Safety: if paragraph is too small (< 300 chars), expand to at least some context
  if (end - start < 300) {
    start = Math.max(0, index - 200);
    end = Math.min(text.length, index + 800);
  }
  
  return { text: text.substring(start, end), start, end };
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
