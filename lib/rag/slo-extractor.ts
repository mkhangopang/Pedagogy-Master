
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
  // Compact Sindh: B09A01, P10C12, CS09A01
  /\b([A-Z]{1,3})(\d{2})([A-Z])(\d{2})\b/g,
  
  // Hyphenated Sindh: B-09-A-01
  /\b([A-Z]{1,3})-\d{2}-[A-Z]-\d{2}\b/g,

  // Legacy/Federal: S8a5
  /\b([A-Z])(\d{1,2})([a-z])(\d{1,2})\b/g,
  
  // Standard Labelled: SLO: ...
  /\bSLO[-\s]?([A-Z])[-\s]?(\d{1,2})[-\s]?([a-z])[-\s]?(\d{1,2})\b/gi,
  
  // Year/Num: 2004/12
  /\b(\d{4})\/(\d{2,4})\b/g,
  
  // IB/International
  /\b(MYP|DP)\s+(criterion\s+)?([A-D]|\d+\.\d+)\b/gi,
  
  // Generic Objectives
  /\b(LO|Outcome|Objective)[-\s]?(\d+(?:\.\d+)?)\b/gi,
];

export function extractSLOCodes(documentText: string): ExtractedSLO[] {
  const extracted: ExtractedSLO[] = [];
  const seen = new Set<string>();
  
  for (const pattern of SLO_PATTERNS) {
    const matches = documentText.matchAll(pattern);
    for (const match of matches) {
      const code = match[0];
      // Normalize code to uppercase for deduplication
      const cleanCode = code.toUpperCase().replace(/\s/g, '');
      
      if (seen.has(cleanCode)) continue;
      seen.add(cleanCode);
      
      const startIndex = Math.max(0, match.index! - 200);
      const endIndex = Math.min(documentText.length, match.index! + code.length + 200);
      const context = documentText.substring(startIndex, endIndex);
      
      // Attempt to find a description following the code
      // Looks for: CODE [separator] Description
      const descMatch = context.match(new RegExp(`${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:–-]\s*([^.\n]+)`));
      const description = descMatch ? descMatch[1].trim() : '';
      const confidence = calculateConfidence(code, context);
      
      if (confidence > 0.5) {
        extracted.push({ code: code.toUpperCase(), description, context, confidence });
      }
    }
  }
  return extracted.sort((a, b) => b.confidence - a.confidence);
}

function calculateConfidence(code: string, context: string): number {
  let confidence = 0.6;
  const lowerContext = context.toLowerCase();
  const keywords = ['objective', 'outcome', 'slo', 'standard', 'learning', 'students will', 'benchmark'];
  for (const keyword of keywords) {
    if (lowerContext.includes(keyword)) confidence += 0.1;
  }
  // If it matches strict Sindh format (B09A01), high confidence
  if (code.match(/^[A-Z]{1,3}\d{2}[A-Z]\d{2}$/)) confidence += 0.3;
  
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
  const normalized = normalizeSLO(sloCode);
  if (index[sloCode]) {
    return `SLO ${sloCode}: ${index[sloCode].description}\n\nContext: ${index[sloCode].fullContext}`;
  }
  for (const [code, data] of Object.entries(index)) {
    if (normalizeSLO(code) === normalized) {
      return `SLO ${code}: ${data.description}\n\nContext: ${data.fullContext}`;
    }
  }
  return null;
}

export function normalizeSLO(sloCode: string): string {
  return sloCode.toUpperCase().replace(/[\s-]/g, '');
}
