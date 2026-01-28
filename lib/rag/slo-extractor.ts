/**
 * NEURAL SLO NORMALIZER (v8.0)
 * Optimized for Sindh & Pakistan Standards: S-08-C-03 -> S08C03
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // 1. Identification of components (Letters and Numbers)
  // This handles S-08-C-03 by preserving the order: S, 08, C, 03
  const parts = code.toUpperCase().match(/([A-Z]+)|(\d+)/g);
  if (!parts) return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // 2. Canonical Reconstruction with 2-digit Zero-Padding
  return parts.map(p => {
    if (/^\d+$/.test(p)) {
      const num = parseInt(p, 10);
      // Ensure Grade and Sequence are always 2 digits for grid alignment
      return num < 10 && p.length === 1 ? `0${num}` : p;
    }
    return p;
  }).join('');
}

/**
 * Extracts the grade level from a normalized SLO code (e.g., S08C03 -> 8).
 */
export function extractGradeFromSLO(normalizedCode: string): string | null {
  const match = normalizedCode.match(/[A-Z](\d{2})/i);
  if (match) {
    const grade = parseInt(match[1], 10);
    return grade.toString();
  }
  return null;
}

/**
 * STRATEGIC SLO EXTRACTOR (v8.0)
 * Scans queries for specific curriculum IDs with high precision.
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  const patterns = [
    // Multi-dash format (e.g., S-08-C-03)
    /[A-Z]\s*-?\s*\d{1,2}\s*-?\s*[A-Z]\s*-?\s*\d{1,2}/gi,
    // Shorthand format (e.g., s8c3)
    /\b[A-Z]\d{1,2}[A-Z]\d{1,2}\b/gi,
    // Hybrid shorthands
    /\b[A-Z]-?\d{1,2}\s*[A-Z]-?\d{1,2}\b/gi
  ];
  
  const matches: string[] = [];
  
  patterns.forEach(pattern => {
    const found = query.match(pattern);
    if (found) {
      found.forEach(match => {
        const normalized = normalizeSLO(match);
        if (normalized && normalized.length >= 4 && !matches.includes(normalized)) {
          matches.push(normalized);
        }
      });
    }
  });
  
  return matches;
}