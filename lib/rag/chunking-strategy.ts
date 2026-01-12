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
 * Flexible SLO Pattern: Matches 'S8 A5', 's8.a5', 'S-8-A-5', '8.1.5', etc.
 */
const SLO_REGEX = /\b[A-Z]?\s*\d{1,3}[.\-\s]*[A-Z]?\s*\d{1,3}\b/gi;

/**
 * Normalizes an SLO code to a standard alphanumeric format for storage: S8A5
 */
const normalizeSLO = (code: string) => code.replace(/[^A-Z0-9]/gi, '').toUpperCase();

export function chunkDocument(text: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  
  // Strategy 1: Targeted SLO Extraction (Anchor Chunks)
  let match;
  const tempSloRegex = new RegExp(SLO_REGEX); 
  while ((match = tempSloRegex.exec(text)) !== null) {
    const rawCode = match[0];
    // Filter out simple numbers that aren't likely SLOs
    if (!/[A-Z]/i.test(rawCode) && rawCode.length < 3) continue;

    const sloCode = normalizeSLO(rawCode);
    const start = Math.max(0, match.index - 400); // Expanded context window
    const end = Math.min(text.length, match.index + 1200);
    
    chunks.push({
      text: text.substring(start, end).trim(),
      index: chunks.length,
      type: 'slo_definition',
      sloMentioned: [sloCode],
      keywords: extractKeywords(text.substring(start, end)),
      semanticDensity: 0.95,
      sectionTitle: `Curriculum Objective: ${rawCode}`
    });
  }

  // Strategy 2: Logical Section Breaks (The connective tissue)
  const sections = text.split(/\n(?=(?:\d+\.|\*|#{1,3})\s+[A-Z])/);
  sections.forEach((section, idx) => {
    if (section.length < 150) return;
    
    const lines = section.trim().split('\n');
    const potentialTitle = lines[0].length < 100 ? lines[0] : `Section ${idx + 1}`;

    const sloCodes = Array.from(section.matchAll(SLO_REGEX), m => normalizeSLO(m[0]))
                         .filter(code => code.length >= 2);
    
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
    const key = c.text.substring(0, 80).replace(/\s/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
