/**
 * NEURAL SLO NORMALIZER (v17.0)
 * Optimized for Sindh Curriculum 2024 & High-Speed Skimming.
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  const cleanCode = code.replace(/[\[\]]/g, '').trim().toUpperCase();
  // Pattern: [B]-[Grade]-[Domain]-[Number] -> Handles B-9, B-09, B 09, etc.
  const sindhMatch = cleanCode.match(/([B-Z])\s*-?\s*(0?9|10|11|12)\s*-?\s*([A-Z])\s*-?\s*(\d{1,2})/i);
  
  if (sindhMatch) {
    const subject = sindhMatch[1].toUpperCase();
    const grade = sindhMatch[2].padStart(2, '0'); // Force 09
    const domain = sindhMatch[3].toUpperCase();
    const num = sindhMatch[4].padStart(2, '0');
    return `${subject}-${grade}-${domain}-${num}`;
  }

  return cleanCode.replace(/\s+/g, '-');
}

/**
 * STRATEGIC GRID EXTRACTOR
 * Targets SLO codes B9-B12 with high tolerance for PDF parsing noise.
 */
export function extractSLOCodes(text: string): string[] {
  if (!text) return [];
  
  const matches = new Set<string>();
  
  // Elastic Sindh 2024 Pattern: 
  // Captures B-09-A-01, B-9-A-1, B 10 C 05, etc.
  const pattern = /(?:SLO[:\s-]*)?([B-Z]\s*-?\s*(?:0?9|10|11|12)\s*-?\s*[A-Z]\s*-?\s*\d{1,2})/gi;
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