/**
 * NEURAL SLO NORMALIZER (v20.0)
 * Expanded for Universal Multi-Separator Alignment and Typo Resilience (SLO vs SL0).
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // Clean brackets and handle common zero/O typos in 'SLO'
  const cleanCode = code.replace(/[\[\]]/g, '').trim().toUpperCase();
  
  // Pattern 1: Multi-Separator Sindh 2024 (B-12-P-06 or B.12.P.06 or B 12 P 06)
  // Handles B-12-P-06 (Physiology/Environmental) specifically
  const sindhMatch = cleanCode.match(/([B-Z])\s*[\-\.\s]?\s*(0?9|10|11|12)\s*[\-\.\s]?\s*([A-Z])\s*[\-\.\s]?\s*(\d{1,2})/i);
  if (sindhMatch) {
    const subject = sindhMatch[1].toUpperCase();
    const grade = sindhMatch[2].padStart(2, '0');
    const domain = sindhMatch[3].toUpperCase();
    const num = sindhMatch[4].padStart(2, '0');
    return `${subject}-${grade}-${domain}-${num}`;
  }

  // Pattern 2: Condensed / Page Reference (B12.p6 or B12p6)
  const condensedMatch = cleanCode.match(/([B-Z])(0?9|10|11|12)[\.P]?(\d{1,2})/i);
  if (condensedMatch) {
    const subject = condensedMatch[1].toUpperCase();
    const grade = condensedMatch[2].padStart(2, '0');
    const num = condensedMatch[3].padStart(2, '0');
    return `${subject}-${grade}-P-${num}`;
  }

  return cleanCode.replace(/[\s\.]+/g, '-');
}

/**
 * STRATEGIC GRID EXTRACTOR
 * Universally captures official board codes and handles the 'SL0' typo.
 */
export function extractSLOCodes(text: string): string[] {
  if (!text) return [];
  
  const matches = new Set<string>();
  
  // Updated pattern to handle SL0 (zero) and SLO (letter O)
  const pattern = /(?:SL[O0][:\s-]*)?([B-Z]\s*[\-\.\s]?\s*(?:0?9|10|11|12)\s*(?:[\-\.\s]?\s*[A-Z]?\s*[\-\.\s]?\s*|\.[pP]?|pP?)\d{1,2})/gi;
  const rawMatches = Array.from(text.matchAll(pattern));
  
  for (const match of rawMatches) {
    const normalized = normalizeSLO(match[1]);
    if (normalized) matches.add(normalized);
  }
  
  return Array.from(matches);
}

export function extractGradeFromSLO(normalizedCode: string): string | null {
  const match = normalizedCode.match(/[A-Z]-(09|10|11|12)/);
  return match ? match[1] : null;
}