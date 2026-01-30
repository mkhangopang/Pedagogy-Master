/**
 * NEURAL SLO NORMALIZER (v15.0)
 * Optimized for Sindh Curriculum 2024 & International Standards.
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // High-fidelity pattern for Sindh 2024: [Subject]-[Grade]-[Domain]-[Number]
  // Matches B-09-A-01, B09A01, B 09 A 01, etc.
  const cleanCode = code.replace(/[\[\]]/g, '').trim();
  const sindhMatch = cleanCode.toUpperCase().match(/([B-Z])\s*-?\s*(\d{1,2})\s*-?\s*([A-Z])?\s*-?\s*(\d{1,2})/);
  
  if (sindhMatch) {
    const subject = sindhMatch[1];
    const grade = sindhMatch[2].padStart(2, '0');
    const domain = sindhMatch[3] || 'X'; 
    const num = sindhMatch[4].padStart(2, '0');
    return `${subject}-${grade}-${domain}-${num}`;
  }

  return cleanCode.toUpperCase().replace(/\s+/g, '-');
}

/**
 * STRATEGIC SLO EXTRACTOR
 * Scans user queries or text chunks for curriculum anchors.
 * Supports both [SLO:...] and - SLO: formats.
 */
export function extractSLOCodes(text: string): string[] {
  if (!text) return [];
  
  const matches = new Set<string>();
  
  // 1. Bracketed Format: [SLO:B-09-A-01]
  const patternBracketed = /\[SLO:\s*([B-Z]-?\d{2}-?[A-Z]-?\d{2})\]/gi;
  const foundBracketed = Array.from(text.matchAll(patternBracketed));
  for (const match of foundBracketed) {
    matches.add(normalizeSLO(match[1]));
  }

  // 2. Dash/Colon Format: - SLO: B-09-A-01
  const patternPrefixed = /SLO\s*[:\s-]*([B-Z]-?\d{2}-?[A-Z]-?\d{2})/gi;
  const foundPrefixed = Array.from(text.matchAll(patternPrefixed));
  for (const match of foundPrefixed) {
    matches.add(normalizeSLO(match[1]));
  }

  // 3. Raw Pattern Matcher (Safety Net)
  const patternRaw = /([B-Z])\s*-?\s*(\d{2})\s*-?\s*([A-Z])\s*-?\s*(\d{2})/gi;
  const foundRaw = Array.from(text.matchAll(patternRaw));
  for (const match of foundRaw) {
    matches.add(normalizeSLO(match[0]));
  }
  
  return Array.from(matches);
}

export function extractGradeFromSLO(normalizedCode: string): string | null {
  const match = normalizedCode.match(/[A-Z]-(\d{2})/);
  return match ? parseInt(match[1], 10).toString() : null;
}