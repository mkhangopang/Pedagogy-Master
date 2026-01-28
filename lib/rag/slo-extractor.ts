/**
 * NEURAL SLO NORMALIZER (v10.0)
 * Optimized for Sindh Curriculum: s7b44 -> S-07-B-44
 * Mapping: S[Grade]-[Domain]-[Number]
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // Clean string and extract segments: [S, 7, B, 44]
  const segments = code.toUpperCase().match(/([A-Z])|(\d+)/g);
  if (!segments || segments.length < 2) return code.toUpperCase();

  let grade = '';
  let domain = 'A'; // Default to Life Science (A)
  let number = '';

  // Logic to handle S-07-B-44 or shorthand s7b44
  // We assume the first alpha is 'S' (Standard/Grade), followed by Grade Num, then Domain Alpha, then SLO Num
  let segmentIndex = 0;
  
  if (segments[0] === 'S') {
    segmentIndex = 1;
    grade = segments[1].padStart(2, '0');
    if (segments[2] && isNaN(parseInt(segments[2]))) {
      domain = segments[2];
      number = segments[3] ? segments[3].padStart(2, '0') : '01';
    } else {
      number = segments[2] ? segments[2].padStart(2, '0') : '01';
    }
  }

  // Final Canonical Format used in your MD files: S-07-B-44
  return `S-${grade}-${domain}-${number}`;
}

/**
 * STRATEGIC SLO EXTRACTOR
 * Detects sloppy user inputs and prepares them for the vault query.
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  // Matches: s7b44, S-07-B-44, s8 c3, SLO S4a1
  const patterns = [
    /S\s*-?\s*(\d{1,2})\s*-?\s*([A-Z])\s*-?\s*(\d{1,2})/gi, // Full format
    /\bS(\d{1,2})([A-Z])(\d{1,2})\b/gi,                     // No-dash shorthand
    /\bS(\d{1,2})\s*([A-Z])\s*(\d{1,2})\b/gi                // Space shorthand
  ];
  
  const matches = new Set<string>();
  
  patterns.forEach(pattern => {
    const found = query.matchAll(pattern);
    for (const match of found) {
      const grade = match[1].padStart(2, '0');
      const domain = match[2].toUpperCase();
      const num = match[3].padStart(2, '0');
      matches.add(`S-${grade}-${domain}-${num}`);
    }
  });
  
  return Array.from(matches);
}

export function extractGradeFromSLO(normalizedCode: string): string | null {
  const match = normalizedCode.match(/S-(\d{2})/);
  return match ? parseInt(match[1], 10).toString() : null;
}
