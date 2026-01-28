/**
 * NEURAL SLO NORMALIZER (v7.0)
 * Optimized for complex multi-segmented codes: S-08-B-34 -> S08B34
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // 1. Identification of components (Letters and Numbers)
  // This handles S-08-B-34 by preserving the order: S, 08, B, 34
  const parts = code.toUpperCase().match(/([A-Z]+)|(\d+)/g);
  if (!parts) return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // 2. Canonical Reconstruction with 2-digit Zero-Padding
  return parts.map(p => {
    if (/^\d+$/.test(p)) {
      const num = parseInt(p, 10);
      // Pad to 2 digits (8 -> 08) to ensure lexicographical sorting and match consistency
      return num < 10 && p.length === 1 ? `0${num}` : p;
    }
    return p;
  }).join('');
}

/**
 * Extracts the grade level from a normalized SLO code (e.g., S08B34 -> 8).
 */
export function extractGradeFromSLO(normalizedCode: string): string | null {
  // Looks for the first 2-digit sequence in the code which identifies the grade (e.g., S08...)
  const match = normalizedCode.match(/[A-Z](\d{2})/i);
  if (match) {
    const grade = parseInt(match[1], 10);
    return grade.toString();
  }
  return null;
}

/**
 * STRATEGIC SLO EXTRACTOR (v7.0)
 * Identifies curriculum codes within user queries with high precision.
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  // Standard patterns for Pakistan Board standards (S-08-B-34, S08B34, S-04-A-01)
  const patterns = [
    // Multi-dash format (e.g., S-08-B-34)
    /[A-Z]\s*-?\s*\d{1,2}\s*-?\s*[A-Z]\s*-?\s*\d{1,2}/gi,
    // Basic alphanumeric (e.g., S08B34)
    /\bS\d{1,2}[A-Z]\d{1,2}\b/gi,
    // Prefixed (e.g., SLO: S08B34)
    /SLO[:\s]*[A-Z0-9\.-]{3,15}/gi
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