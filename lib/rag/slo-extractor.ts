/**
 * NEURAL SLO NORMALIZER (v18.0)
 * Unified for Sindh (B-09-A-01) and Condensed (B12p6) standards.
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  const cleanCode = code.replace(/[\[\]]/g, '').trim().toUpperCase();
  
  // Pattern 1: Sindh 2024 / Standard Hyphenated (B-09-A-01)
  const sindhMatch = cleanCode.match(/([B-Z])\s*-?\s*(0?9|10|11|12)\s*-?\s*([A-Z])\s*-?\s*(\d{1,2})/i);
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
    // Map to a pseudo-domain 'P' for Page/Condensed if no domain exists
    return `${subject}-${grade}-P-${num}`;
  }

  return cleanCode.replace(/\s+/g, '-');
}

/**
 * STRATEGIC GRID EXTRACTOR
 * Universally captures both official board codes and condensed teacher shorthand.
 */
export function extractSLOCodes(text: string): string[] {
  if (!text) return [];
  
  const matches = new Set<string>();
  
  // Unified Regex: Captures B-09-A-01, B12p6, B12.p6, S8a5
  const pattern = /(?:SLO[:\s-]*)?([B-Z]\s*-?\s*(?:0?9|10|11|12)\s*(?:-?\s*[A-Z]?\s*-?\s*|\.[pP]?|pP?)\d{1,2})/gi;
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