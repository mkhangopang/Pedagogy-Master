/**
 * NEURAL SLO NORMALIZER (v6.0)
 * Optimized for complex multi-segmented codes: S-08-B-34 -> S08B34
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  // 1. Remove all noise but keep letters and numbers
  // This handles S-08-B-34 by preserving the character order
  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // 2. Identify the segments (Letters and Numbers)
  const parts = code.toUpperCase().match(/([A-Z]+)|(\d+)/g);
  if (!parts) return cleaned;
  
  // 3. Canonical Reconstruction with Zero-Padding
  return parts.map(p => {
    if (/^\d+$/.test(p)) {
      const num = parseInt(p, 10);
      // Ensure 2-digit padding for grade/sequence numbers (8 -> 08)
      return num < 10 && p.length === 1 ? `0${num}` : p;
    }
    return p;
  }).join('');
}

/**
 * Extracts the grade level from a normalized SLO code (e.g., S08B34 -> 8).
 */
export function extractGradeFromSLO(normalizedCode: string): string | null {
  // Matches the first numeric sequence which usually represents the grade in Pakistan standards
  const match = normalizedCode.match(/[A-Z]+(\d{2})/i);
  if (match) {
    const grade = parseInt(match[1], 10);
    return grade.toString();
  }
  return null;
}

/**
 * STRATEGIC SLO EXTRACTOR (v6.0)
 * Identifies curriculum codes within user queries with high precision.
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  // Sophisticated regex patterns for varied international and local formats
  const patterns = [
    // Standard segment format (S-08-B-34, S-04-A-01)
    /[A-Z]\s*-?\s*\d{1,2}\s*-?\s*[A-Z]\s*-?\s*\d{1,2}/gi,
    // Two segment format (S8A3, S 08 05)
    /[A-Z]\s*-?\s*\d{1,2}\s*-?\s*[A-Z]\d{1,2}/gi,
    // Bare numeric segments with prefix
    /\bSLO[:\s]*[A-Z0-9\.-]{3,15}\b/gi,
    // Raw standard IDs
    /\bS\d{1,2}[A-Z]\d{1,2}\b/gi,
    /\bS-?\d{1,2}-?[A-Z]-?\d{1,2}\b/gi
  ];
  
  const matches: string[] = [];
  
  patterns.forEach(pattern => {
    const found = query.match(pattern);
    if (found) {
      found.forEach(match => {
        const raw = match.replace(/SLO[:\s]*/i, '').trim();
        const normalized = normalizeSLO(raw);
        // Minimum length 3 (e.g., S81) to avoid false positives
        if (normalized && normalized.length >= 3 && !matches.includes(normalized)) {
          matches.push(normalized);
        }
      });
    }
  });
  
  return matches;
}