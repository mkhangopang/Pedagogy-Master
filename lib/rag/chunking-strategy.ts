/**
 * PEDAGOGICAL CHUNKING ENGINE
 * Splits documents into meaningful curriculum units rather than arbitrary lengths.
 */

export interface DocumentChunk {
  text: string;
  index: number;
  type: 'slo_definition' | 'teaching_strategy' | 'assessment' | 'context' | 'general';
  sloMentioned: string[];
  keywords: string[];
  semanticDensity: number;
  sectionTitle?: string;
  pageNumber?: number;
}

export function chunkDocument(text: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const sloPattern = /\b([A-Z])(\d{1,2})([a-z])(\d{1,2})\b/g;
  
  // Strategy 1: Targeted SLO Extraction (Highest Priority)
  let match;
  while ((match = sloPattern.exec(text)) !== null) {
    const sloCode = match[0];
    const start = Math.max(0, match.index - 250);
    const end = Math.min(text.length, match.index + 750);
    
    chunks.push({
      text: text.substring(start, end).trim(),
      index: chunks.length,
      type: 'slo_definition',
      sloMentioned: [sloCode],
      keywords: extractKeywords(text.substring(start, end)),
      semanticDensity: 0.95,
      sectionTitle: "Learning Objective Definition"
    });
  }

  // Strategy 2: Logical Section Breaks
  const sections = text.split(/\n(?=(?:\d+\.|\*|#{1,3})\s+[A-Z])/);
  sections.forEach((section, idx) => {
    if (section.length < 200 || section.length > 2000) return;
    
    // Attempt to extract a title from the first line
    const lines = section.trim().split('\n');
    const potentialTitle = lines[0].length < 100 ? lines[0] : `Section ${idx + 1}`;

    const sloCodes = Array.from(section.matchAll(sloPattern), m => m[0]);
    chunks.push({
      text: section.trim(),
      index: chunks.length,
      type: determineChunkType(section),
      sloMentioned: Array.from(new Set(sloCodes)),
      keywords: extractKeywords(section),
      semanticDensity: 0.8,
      sectionTitle: potentialTitle
    });
  });

  return deduplicateChunks(chunks);
}

function determineChunkType(text: string): DocumentChunk['type'] {
  const lower = text.toLowerCase();
  if (lower.includes('strategy') || lower.includes('activity')) return 'teaching_strategy';
  if (lower.includes('quiz') || lower.includes('rubric') || lower.includes('test')) return 'assessment';
  return 'general';
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const stopWords = new Set(['this', 'that', 'with', 'from', 'they', 'their']);
  return Array.from(new Set(words.filter(w => !stopWords.has(w)))).slice(0, 8);
}

function deduplicateChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  const seen = new Set<string>();
  return chunks.filter(c => {
    const key = c.text.substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}