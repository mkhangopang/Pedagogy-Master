
/**
 * Extract SLO codes from curriculum documents.
 * Supports Pakistan (Federal/Provincial), Cambridge, IB formats.
 */

export interface ExtractedSLO {
  code: string;
  description: string;
  context: string;
  confidence: number;
}

const SLO_PATTERNS = [
  /\b([A-Z])(\d{1,2})([a-z])(\d{1,2})\b/g,
  /\bSLO[-\s]?([A-Z])[-\s]?(\d{1,2})[-\s]?([a-z])[-\s]?(\d{1,2})\b/gi,
  /\b(\d{4})\/(\d{2,4})\b/g,
  /\b(MYP|DP)\s+(criterion\s+)?([A-D]|\d+\.\d+)\b/gi,
  /\b(LO|Outcome|Objective)[-\s]?(\d+(?:\.\d+)?)\b/gi,
];

export function extractSLOCodes(documentText: string): ExtractedSLO[] {
  const extracted: ExtractedSLO[] = [];
  const seen = new Set<string>();
  
  for (const pattern of SLO_PATTERNS) {
    const matches = documentText.matchAll(pattern);
    for (const match of matches) {
      const code = match[0];
      if (seen.has(code)) continue;
      seen.add(code);
      
      const startIndex = Math.max(0, match.index! - 200);
      const endIndex = Math.min(documentText.length, match.index! + code.length + 200);
      const context = documentText.substring(startIndex, endIndex);
      
      const descMatch = context.match(new RegExp(`${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:–-]\\s*([^.]+)`));
      const description = descMatch ? descMatch[1].trim() : '';
      const confidence = calculateConfidence(code, context);
      
      if (confidence > 0.5) {
        extracted.push({ code, description, context, confidence });
      }
    }
  }
  return extracted.sort((a, b) => b.confidence - a.confidence);
}

function calculateConfidence(code: string, context: string): number {
  let confidence = 0.6;
  const lowerContext = context.toLowerCase();
  const keywords = ['objective', 'outcome', 'slo', 'standard', 'learning', 'students will'];
  for (const keyword of keywords) {
    if (lowerContext.includes(keyword)) confidence += 0.1;
  }
  if (lowerContext.includes(':') || lowerContext.includes('–')) confidence += 0.15;
  return Math.min(confidence, 1.0);
}

export interface SLOIndex {
  [sloCode: string]: {
    description: string;
    fullContext: string;
    documentName: string;
    confidence: number;
  };
}

export function createSLOIndex(extractedSLOs: ExtractedSLO[], documentName: string): SLOIndex {
  const index: SLOIndex = {};
  for (const slo of extractedSLOs) {
    index[slo.code] = {
      description: slo.description,
      fullContext: slo.context,
      documentName,
      confidence: slo.confidence,
    };
  }
  return index;
}

export function searchSLO(sloCode: string, index: SLOIndex): string | null {
  const normalized = sloCode.toUpperCase().replace(/\s/g, '');
  if (index[sloCode]) {
    return `SLO ${sloCode}: ${index[sloCode].description}\n\nContext: ${index[sloCode].fullContext}`;
  }
  for (const [code, data] of Object.entries(index)) {
    if (code.replace(/\s/g, '') === normalized) {
      return `SLO ${code}: ${data.description}\n\nContext: ${data.fullContext}`;
    }
  }
  return null;
}
