/**
 * NEURAL SLO NORMALIZER
 * Converts various formats (S8A3, S-08-A-03, s8c3, S 8 C 3) into a canonical ID (S08A03).
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  // Extract alphabetic and numeric components, ignoring spaces/punctuation
  const parts = code.toUpperCase().match(/([A-Z]+)|(\d+)/g);
  if (!parts) return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  return parts.map(p => {
    // Zero-pad numbers to 2 digits (8 -> 08)
    if (/^\d+$/.test(p)) return p.padStart(2, '0');
    return p;
  }).join('');
}

/**
 * Extracts the grade level from a normalized SLO code (e.g., S08A05 -> 8).
 */
export function extractGradeFromSLO(normalizedCode: string): string | null {
  const match = normalizedCode.match(/[A-Z]+(\d{2})/i);
  if (match) {
    return parseInt(match[1], 10).toString();
  }
  return null;
}

/**
 * Extracts and normalizes SLO codes from text with space-resilient patterns.
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  // Patterns to handle optional spaces and mixed casing: S 8 C 3, S-08-A-03, s8 c4, etc.
  const patterns = [
    /S\s*-?\s*\d{1,2}\s*-?\s*[A-Z]\s*-?\s*\d{1,2}/gi,
    /SLO[:\s]*S\s*-?\s*\d{1,2}\s*-?\s*[A-Z]\s*-?\s*\d{1,2}/gi,
    /\b[A-Z]\s*\d{1,2}\s*[A-Z]\s*\d{1,2}\b/gi,
    /\b[A-Z]\s*\d{1,2}\s*[A-Z]\b/gi,
    /\bS\d{1,2}\s*[A-Z]\d{1,2}\b/gi
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