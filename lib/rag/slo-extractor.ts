/**
 * NEURAL SLO NORMALIZER (v13.0)
 * Optimized for Sindh Curriculum 2024 (B-09-A-01, B-11-C-04, etc.)
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // Pattern: [Subject]-[Grade]-[Domain]-[Number]
  // Matches: B-09-A-01, S-10-B-05, X-09-01
  const sindhMatch = code.toUpperCase().match(/([A-Z])-?(\d{1,2})-?([A-Z])?-?(\d{1,2})/);
  if (sindhMatch) {
    const subject = sindhMatch[1];
    const grade = sindhMatch[2].padStart(2, '0');
    const domain = sindhMatch[3] || 'X'; // Default to X for experimentation skills
    const num = sindhMatch[4].padStart(2, '0');
    return `${subject}-${grade}-${domain}-${num}`;
  }

  return code.toUpperCase().replace(/\s+/g, '-').replace(/[\[\]]/g, '');
}

/**
 * STRATEGIC SLO EXTRACTOR
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  const matches = new Set<string>();
  
  // 1. Target Sindh 2024 Format: B-09-A-01
  const pattern2024 = /([B-Z])\s*-?\s*(\d{2})\s*-?\s*([A-Z])?\s*-?\s*(\d{2})/gi;
  const found2024 = query.matchAll(pattern2024);
  for (const match of found2024) {
    const subject = match[1].toUpperCase();
    const grade = match[2];
    const domain = (match[3] || 'X').toUpperCase();
    const num = match[4];
    
    matches.add(`${subject}-${grade}-${domain}-${num}`);
    matches.add(`${subject}${parseInt(grade)}${domain}${parseInt(num)}`);
  }

  // 2. Catch bracketed shorthand [SLO:B-09-A-01]
  const patternBracket = /\[SLO:\s*([^\]]+)\]/gi;
  const foundBrackets = query.matchAll(patternBracket);
  for (const match of foundBrackets) {
    matches.add(normalizeSLO(match[1]));
  }
  
  return Array.from(matches);
}

export function extractGradeFromSLO(normalizedCode: string): string | null {
  const match = normalizedCode.match(/[A-Z]-(\d{2})/);
  return match ? parseInt(match[1], 10).toString() : null;
}