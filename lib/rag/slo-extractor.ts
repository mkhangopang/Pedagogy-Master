/**
 * NEURAL SLO NORMALIZER (v11.0)
 * Optimized for Sindh Curriculum Multi-Format Matching.
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // Extract segments: [S, 04, A, 01]
  const segments = code.toUpperCase().match(/([A-Z])|(\d+)/g);
  if (!segments || segments.length < 2) return code.toUpperCase();

  let grade = '';
  let domain = 'A';
  let number = '';

  if (segments[0] === 'S') {
    grade = segments[1].padStart(2, '0');
    // Pattern: S-04-A-01
    if (segments[2] && isNaN(parseInt(segments[2]))) {
      domain = segments[2];
      number = segments[3] ? segments[3].padStart(2, '0') : '01';
    } else {
      // Pattern: S-04-01 (Domain omitted)
      number = segments[2] ? segments[2].padStart(2, '0') : '01';
    }
  }

  return `S-${grade}-${domain}-${number}`;
}

/**
 * STRATEGIC SLO EXTRACTOR
 * Returns an array of variants for a single SLO to maximize DB hit rate.
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  // Regex to catch S-04-A-01, s4a1, S4-A-1, etc.
  const pattern = /S\s*-?\s*(\d{1,2})\s*-?\s*([A-Z])\s*-?\s*(\d{1,2})/gi;
  const matches = new Set<string>();
  
  const found = query.matchAll(pattern);
  for (const match of found) {
    const grade = match[1].padStart(2, '0');
    const domain = match[2].toUpperCase();
    const num = match[3].padStart(2, '0');
    
    // Store multiple variants in the search set
    const canonical = `S-${grade}-${domain}-${num}`;
    const shorthand = `S${parseInt(grade)}${domain}${parseInt(num)}`.toUpperCase();
    
    matches.add(canonical);
    matches.add(shorthand);
  }
  
  return Array.from(matches);
}

export function extractGradeFromSLO(normalizedCode: string): string | null {
  const match = normalizedCode.match(/S-(\d{2})/);
  return match ? parseInt(match[1], 10).toString() : null;
}
