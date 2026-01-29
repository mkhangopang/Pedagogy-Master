/**
 * NEURAL SLO NORMALIZER (v14.0)
 * Optimized for Sindh Curriculum 2024 & Federal Standards.
 * Handles: B-09-A-01, [SLO:B-11-C-04], S-10-B-05, etc.
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // High-fidelity pattern for Sindh 2024: [Subject]-[Grade]-[Domain]-[Number]
  const sindhMatch = code.toUpperCase().match(/([A-Z])\s*-?\s*(\d{1,2})\s*-?\s*([A-Z])?\s*-?\s*(\d{1,2})/);
  
  if (sindhMatch) {
    const subject = sindhMatch[1];
    const grade = sindhMatch[2].padStart(2, '0');
    const domain = sindhMatch[3] || 'X'; // Sindh uses 'X' for skills
    const num = sindhMatch[4].padStart(2, '0');
    return `${subject}-${grade}-${domain}-${num}`;
  }

  // Fallback for short formats (e.g. S8a5)
  return code.toUpperCase().replace(/\s+/g, '-').replace(/[\[\]]/g, '');
}

/**
 * STRATEGIC SLO EXTRACTOR
 * Scans user queries or text chunks for curriculum anchors.
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  const matches = new Set<string>();
  
  // 1. Sindh 2024 Deep Matcher: B-09-A-01 or S-10-C-03
  const pattern2024 = /([B-Z])\s*-?\s*(\d{2})\s*-?\s*([A-Z])?\s*-?\s*(\d{2})/gi;
  const found2024 = Array.from(query.matchAll(pattern2024));
  
  for (const match of found2024) {
    const subject = match[1].toUpperCase();
    const grade = match[2];
    const domain = (match[3] || 'X').toUpperCase();
    const num = match[4];
    
    // Store multiple versions for maximum RAG overlap
    matches.add(`${subject}-${grade}-${domain}-${num}`); // Canonical
    matches.add(`${subject}${parseInt(grade)}${domain}${parseInt(num)}`); // Shorthand
  }

  // 2. Bracketed/Explicit Shorthand: [SLO:B-09-A-01]
  const patternExplicit = /\[SLO:\s*([^\]]+)\]/gi;
  const foundExplicit = Array.from(query.matchAll(patternExplicit));
  for (const match of foundExplicit) {
    matches.add(normalizeSLO(match[1]));
  }
  
  return Array.from(matches);
}

/**
 * Grade-specific inference from a normalized SLO code.
 */
export function extractGradeFromSLO(normalizedCode: string): string | null {
  const match = normalizedCode.match(/[A-Z]-(\d{2})/);
  return match ? parseInt(match[1], 10).toString() : null;
}