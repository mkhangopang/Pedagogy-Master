/**
 * NEURAL SLO NORMALIZER (v12.0)
 * Optimized for Sindh Curriculum 2024 Multi-Format Matching (B-09-A-01).
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // Pattern: B-09-A-01 (Biology, Grade 9, Domain A, SLO 1)
  const sindhMatch = code.toUpperCase().match(/([A-Z])-?(\d{1,2})-?([A-Z])-?(\d{1,2})/);
  if (sindhMatch) {
    const subject = sindhMatch[1];
    const grade = sindhMatch[2].padStart(2, '0');
    const domain = sindhMatch[3];
    const num = sindhMatch[4].padStart(2, '0');
    return `${subject}-${grade}-${domain}-${num}`;
  }

  // Fallback for legacy S-04-A-01
  const legacyMatch = code.toUpperCase().match(/S-?(\d{1,2})-?([A-Z])-?(\d{1,2})/);
  if (legacyMatch) {
    const grade = legacyMatch[1].padStart(2, '0');
    const domain = legacyMatch[2];
    const num = legacyMatch[3].padStart(2, '0');
    return `S-${grade}-${domain}-${num}`;
  }

  return code.toUpperCase().replace(/\s+/g, '-');
}

/**
 * STRATEGIC SLO EXTRACTOR
 * Returns an array of variants for a single SLO to maximize DB hit rate.
 * Specifically tuned for the Sindh 2024 Progression Grid.
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  const matches = new Set<string>();
  
  // 1. Target Sindh 2024 Format: B-09-A-01
  const pattern2024 = /([B-Z])\s*-?\s*(\d{1,2})\s*-?\s*([A-Z])\s*-?\s*(\d{1,2})/gi;
  const found2024 = query.matchAll(pattern2024);
  for (const match of found2024) {
    const subject = match[1].toUpperCase();
    const grade = match[2].padStart(2, '0');
    const domain = match[3].toUpperCase();
    const num = match[4].padStart(2, '0');
    
    matches.add(`${subject}-${grade}-${domain}-${num}`);
    matches.add(`${subject}${parseInt(grade)}${domain}${parseInt(num)}`);
  }

  // 2. Target Legacy/Shorthand: S8a5, SLO 8.1.1
  const patternLegacy = /S\s*-?\s*(\d{1,2})\s*-?\s*([A-Z])\s*-?\s*(\d{1,2})/gi;
  const foundLegacy = query.matchAll(patternLegacy);
  for (const match of foundLegacy) {
    const grade = match[1].padStart(2, '0');
    const domain = match[2].toUpperCase();
    const num = match[3].padStart(2, '0');
    matches.add(`S-${grade}-${domain}-${num}`);
  }
  
  return Array.from(matches);
}

export function extractGradeFromSLO(normalizedCode: string): string | null {
  const match = normalizedCode.match(/[A-Z]-(\d{2})/);
  return match ? parseInt(match[1], 10).toString() : null;
}