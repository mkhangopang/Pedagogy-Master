/**
 * NEURAL SLO NORMALIZER (v5.0)
 * Converts various formats (S8A3, S-08-A-03, s8c3, S 8 C 3) into a canonical ID (S08C03).
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  // Extract alphabetic and numeric components, ignoring spaces/punctuation
  // This handles S-08-C-05 by capturing S, 08, C, 05
  const parts = code.toUpperCase().match(/([A-Z]+)|(\d+)/g);
  if (!parts) return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  return parts.map(p => {
    // Zero-pad numbers to 2 digits (8 -> 08) to ensure lexicographical and filtering precision
    if (/^\d+$/.test(p)) {
      const num = parseInt(p, 10);
      return num < 10 && p.length === 1 ? `0${num}` : p;
    }
    return p;
  }).join('');
}

/**
 * Extracts the grade level from a normalized SLO code (e.g., S08A05 -> 8).
 */
export function extractGradeFromSLO(normalizedCode: string): string | null {
  // Matches the first numeric group in a canonical code
  const match = normalizedCode.match(/[A-Z]*(\d{2})/i);
  if (match) {
    const grade = parseInt(match[1], 10);
    return grade.toString();
  }
  return null;
}

/**
 * Extracts and normalizes SLO codes from text with strict standard boundaries.
 * Optimized for Pakistan Curriculum (Sindh, Federal) and International Standards.
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  // Patterns for various curriculum codes: S8A5, S 08 A 05, S-04-A-01, S-08-C-05, etc.
  const patterns = [
    /S\s*-?\s*\d{1,2}\s*-?\s*[A-Z]\s*-?\s*\d{1,2}/gi,
    /SLO[:\s]*S\s*-?\s*\d{1,2}\s*-?\s*[A-Z]\s*-?\s*\d{1,2}/gi,
    /\b[A-Z]{1,2}\s*\d{1,2}\s*[A-Z]\s*\d{1,2}\b/gi,
    /\bS\d{1,2}[A-Z]\d{1,2}\b/gi,
    /\bS-?\d{1,2}-?[A-Z]-?\d{1,2}\b/gi // Specific dash support
  ];
  
  const matches: string[] = [];
  
  patterns.forEach(pattern => {
    const found = query.match(pattern);
    if (found) {
      found.forEach(match => {
        const raw = match.replace(/SLO[:\s]*/i, '').trim();
        const normalized = normalizeSLO(raw);
        if (normalized && normalized.length >= 3 && !matches.includes(normalized)) {
          matches.push(normalized);
        }
      });
    }
  });
  
  return matches;
}