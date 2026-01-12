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

/**
 * Robust SLO Pattern: Matches 'S8 A5', 's8a5', 'S-8-a-5', etc.
 */
const SLO_REGEX = /\b([a-z])\s*(\d{1,2})\s*([a-z])\s*(\d{1,2})\b/gi;

/**
 * Normalizes an SLO code to a standard format: S8A5
 */
const normalizeSLO = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();

export function chunkDocument(text: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  
  // Strategy 1: Targeted SLO Extraction (Highest Priority)
  // We scan for SLO patterns and create "Anchor Chunks" with extra context
  let match;
  const tempSloRegex = new RegExp(SLO_REGEX); // Create fresh instance for exec loop
  while ((match = tempSloRegex.exec(text)) !== null) {
    const sloCode = normalizeSLO(match[0]);
    const start = Math.max(0, match.index - 300);
    const end = Math.min(text.length, match.index + 1000);
    
    chunks.push({
      text: text.substring(start, end).trim(),
      index: chunks.length,
      type: 'slo_definition',
      sloMentioned: [sloCode],
      keywords: extractKeywords(text.substring(start, end)),
      semanticDensity: 0.95,
      sectionTitle: `Curriculum Objective: ${sloCode}`
    });
  }

  // Strategy 2: Logical Section Breaks
  // This ensures we capture the "connective tissue" of the document
  const sections = text.split(/\n(?=(?:\d+\.|\*|#{1,3})\s+[A-Z])/);
  sections.forEach((section, idx) => {
    if (section.length < 150) return;
    
    const lines = section.trim().split('\n');
    const potentialTitle = lines[0].length < 100 ? lines[0] : `Section ${idx + 1}`;

    const sloCodes = Array.from(section.matchAll(SLO_REGEX), m => normalizeSLO(m[0]));
    
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
  if (lower.includes('strategy') || lower.includes('activity') || lower.includes('pedagogy')) return 'teaching_strategy';
  if (lower.includes('quiz') || lower.includes('rubric') || lower.includes('assessment')) return 'assessment';
  return 'general';
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const stopWords = new Set(['this', 'that', 'with', 'from', 'they', 'their', 'learning', 'students']);
  return Array.from(new Set(words.filter(w => !stopWords.has(w)))).slice(0, 8);
}

function deduplicateChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  const seen = new Set<string>();
  return chunks.filter(c => {
    // Fingerprint based on first 80 chars to allow overlapping windows but prevent identical dupes
    const key = c.text.substring(0, 80).replace(/\s/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
