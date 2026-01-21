/**
 * NEURAL SLO NORMALIZER
 * Converts various formats (S8A3, S-08-A-03, s8c3) into a canonical ID (S08A03).
 * Ensures consistency between indexing and retrieval.
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  // Extract alphabetic and numeric components
  const parts = code.toUpperCase().match(/([A-Z]+)|(\d+)/g);
  if (!parts) return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  return parts.map(p => {
    // Zero-pad numbers to 2 digits (8 -> 08) for deterministic sorting and matching
    if (/^\d+$/.test(p)) return p.padStart(2, '0');
    return p;
  }).join('');
}

/**
 * Extracts and normalizes SLO codes from text.
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  const patterns = [
    /S-?\d{1,2}-?[A-Z]-?\d{1,2}/gi,
    /SLO[:\s]*S-?\d{1,2}-?[A-Z]-?\d{1,2}/gi,
    /\b[A-Z]\d{1,2}[A-Z]\d{1,2}\b/gi
  ];
  
  const matches: string[] = [];
  
  patterns.forEach(pattern => {
    const found = query.match(pattern);
    if (found) {
      found.forEach(match => {
        const raw = match.replace(/SLO[:\s]*/i, '');
        const normalized = normalizeSLO(raw);
        if (normalized && !matches.includes(normalized)) {
          matches.push(normalized);
        }
      });
    }
  });
  
  if (matches.length > 0) {
    console.log('🎯 [SLO Extractor] Normalized Codes:', matches);
  }
  return matches;
}