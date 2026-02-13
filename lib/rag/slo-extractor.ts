
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
  // 1. New Master MD Generated 5-Part Code: B-11-J-13-01
  /\b([A-Z]{1,3})[-\s]?(\d{1,2})[-\s]?([A-Z])[-\s]?(\d{1,2})[-\s]?(\d{1,3})\b/g,

  // 2. Spaced/Messy Sindh Format: [SLO: B - 09 - A - 01]
  /(?:\[|\b)SL[O0]\s*[:\s-]*([A-Z]{1,3})\s*[:\s-]+\s*(\d{2})\s*[:\s-]+\s*([A-Z])\s*[:\s-]+\s*(\d{1,3})(?:\]|\b)/gi,

  // 3. Compact/Standard: B09A01 or B-09-A-01
  /\b([A-Z]{1,3})[-\s]?(\d{2})[-\s]?([A-Z])[-\s]?(\d{1,3})\b/g,

  // 4. Legacy/Federal: S8a5
  /\b([A-Z])(\d{1,2})([a-z])(\d{1,2})\b/g,
  
  // 5. International / Numbered
  /\b(MYP|DP)\s+(criterion\s+)?([A-D]|\d+\.\d+)\b/gi,
  /\b(LO|Outcome|Objective)[-\s]?(\d+(?:\.\d+)?)\b/gi,
];

export function extractSLOCodes(documentText: string): ExtractedSLO[] {
  const extracted: ExtractedSLO[] = [];
  const seen = new Set<string>();
  
  // Pre-normalize text slightly
  const normalizedText = documentText.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');

  for (const pattern of SLO_PATTERNS) {
    const matches = normalizedText.matchAll(pattern);
    for (const match of matches) {
      const fullMatch = match[0];
      
      const cleanKey = fullMatch.replace(/[\s\[\]-]/g, '').toUpperCase();
      if (seen.has(cleanKey)) continue;
      seen.add(cleanKey);
      
      const startIndex = Math.max(0, match.index! - 300);
      const endIndex = Math.min(normalizedText.length, match.index! + fullMatch.length + 500);
      const context = normalizedText.substring(startIndex, endIndex);
      
      // Look for the "Text:" prefix used in Master MD SLO Blocks
      const textMatch = context.match(/Text:\*\*\s*([^\n#<]+)/i);
      const description = textMatch ? textMatch[1].trim() : fullMatch;

      const confidence = calculateConfidence(cleanKey, context);
      
      if (confidence > 0.4) { 
        extracted.push({ code: fullMatch, description, context, confidence });
      }
    }
  }
  return extracted.sort((a, b) => b.confidence - a.confidence);
}

function calculateConfidence(code: string, context: string): number {
  let confidence = 0.6;
  const lowerContext = context.toLowerCase();
  
  if (/^[A-Z]{1,3}\d{1,2}[A-Z]\d{1,2}\d{1,3}$/.test(code)) return 0.98; // 5-part
  if (/^[A-Z]{1,3}\d{2}[A-Z]\d{1,4}$/.test(code)) return 0.95; // 4-part

  const keywords = ['objective', 'outcome', 'slo', 'standard', 'learning', 'students will', 'blooms'];
  for (const keyword of keywords) {
    if (lowerContext.includes(keyword)) confidence += 0.1;
  }
  
  return Math.min(confidence, 1.0);
}

export function normalizeSLO(sloCode: string): string {
  return sloCode.toUpperCase().replace(/\[|\]|SLO|[:\s-]/g, '');
}
