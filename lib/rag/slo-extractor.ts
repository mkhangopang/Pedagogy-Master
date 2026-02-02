/**
 * NEURAL SLO NORMALIZER (v23.0)
 * Precision-tuned for Sindh 2024 [SLO:X-YY-Z-AA] and Federal S8a5 formats.
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // 1. Aggressive Sanitization: Normalize dashes and remove brackets/colons
  const cleanCode = code
    .replace(/[\u2013\u2014]/g, "-") // Normalize en-dash and em-dash to hyphen
    .replace(/[\[\]\:\(\)]/g, '')
    .trim()
    .toUpperCase();
  
  // 2. Sindh 2024 Pattern Detection (B-10-J-20)
  const sindhMatch = cleanCode.match(/([B-Z])\s*[\-\.\s]?\s*(0?9|10|11|12)\s*[\-\.\s]?\s*([A-Z])\s*[\-\.\s]?\s*(\d{1,2})/i);
  if (sindhMatch) {
    const subject = sindhMatch[1].toUpperCase();
    const grade = sindhMatch[2].padStart(2, '0');
    const domain = sindhMatch[3].toUpperCase();
    const num = sindhMatch[4].padStart(2, '0');
    return `${subject}-${grade}-${domain}-${num}`;
  }

  // 3. Shorthand Pattern (B11B27 or S8A5)
  const shorthandMatch = cleanCode.match(/([B-Z])(0?9|10|11|12)([A-Z])(\d{1,2})/i);
  if (shorthandMatch) {
    return `${shorthandMatch[1]}-${shorthandMatch[2].padStart(2, '0')}-${shorthandMatch[3].toUpperCase()}-${shorthandMatch[4].padStart(2, '0')}`;
  }

  // 4. Default: Basic Hyphenation
  return cleanCode.replace(/[\s\.]+/g, '-');
}

/**
 * STRATEGIC GRID EXTRACTOR
 * Specifically handles the [SLO: CODE] pattern found in the Sindh Biology 2024 text.
 */
export function extractSLOCodes(text: string): string[] {
  if (!text) return [];
  
  const matches = new Set<string>();
  
  // Matches "SLO: B-11-B-27", "[SLO:B-11-B-27]", "SL0:B-11-B-27"
  const pattern = /(?:SL[O0][:-\s]*)?([B-Z]\s*[\-\.\s]?\s*(?:0?9|10|11|12)\s*[\-\.\s]?\s*[A-Z]\s*[\-\.\s]?\s*\d{1,2})/gi;
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