/**
 * NEURAL SLO NORMALIZER (v16.0)
 * Optimized for Sindh Curriculum 2024 & High-Speed Skimming.
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  const cleanCode = code.replace(/[\[\]]/g, '').trim().toUpperCase();
  // Pattern: [B]-[Grade]-[Domain]-[Number] -> B-09-A-01
  const sindhMatch = cleanCode.match(/([B-Z])\s*-?\s*(09|10|11|12)\s*-?\s*([A-Z])\s*-?\s*(\d{1,2})/);
  
  if (sindhMatch) {
    const subject = sindhMatch[1];
    const grade = sindhMatch[2];
    const domain = sindhMatch[3];
    const num = sindhMatch[4].padStart(2, '0');
    return `${subject}-${grade}-${domain}-${num}`;
  }

  return cleanCode.replace(/\s+/g, '-');
}

/**
 * STRATEGIC GRID EXTRACTOR
 * Specifically targets SLO codes B9-B12 for rapid skimming.
 */
export function extractSLOCodes(text: string): string[] {
  if (!text) return [];
  
  const matches = new Set<string>();
  
  // Strict Sindh 2024 Regex: Captures B-09-A-01, [SLO:B-10-C-05], etc.
  const pattern = /(?:SLO[:\s-]*)?([B-Z]-(?:09|10|11|12)-[A-Z]-\d{1,2})/gi;
  const rawMatches = Array.from(text.matchAll(pattern));
  
  for (const match of rawMatches) {
    matches.add(normalizeSLO(match[1]));
  }
  
  return Array.from(matches);
}

export function extractGradeFromSLO(normalizedCode: string): string | null {
  const match = normalizedCode.match(/[A-Z]-(09|10|11|12)/);
  return match ? match[1] : null;
}