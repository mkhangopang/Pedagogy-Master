/**
 * Extracts SLO codes from user queries
 * Matches patterns: S8A5, S-08-A-05, s8a5, S-04-A-01, 8.1.2, G-IV-A
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  // Pattern matches:
  // 1. S + digits + letter + digits (with optional hyphens/dots)
  // 2. Numerical sequences (e.g. 8.1.2)
  // 3. Roman numeral sections (e.g. G-IV-A)
  const patterns = [
    /\b[A-Z][-]?\d{1,2}[-]?([A-Za-z][-]?\d{1,2})?\b/gi,  // S8A5, S-08-A-05, S-04-A-01
    /\bSLO[:\s]*[A-Z0-9][-A-Z0-9\.]+\b/gi,              // SLO: S8A5
    /\b\d+\.\d+(\.\d+)?\b/g                             // 8.1.2
  ];
  
  const matches: string[] = [];
  const noise = ['SLO', 'UNIT', 'GRADE', 'SECTION', 'CHAPTER'];
  
  patterns.forEach(pattern => {
    const found = query.match(pattern);
    if (found) {
      found.forEach(match => {
        // Clean up: remove "SLO:" prefix, normalize format
        const cleaned = match
          .replace(/SLO[:\s]*/i, '')
          .toUpperCase()
          .replace(/[-\.]/g, ''); // Remove hyphens and dots for search consistency
        
        if (cleaned && !noise.includes(cleaned) && cleaned.length > 1 && !matches.includes(cleaned)) {
          matches.push(cleaned);
        }
      });
    }
  });
  
  return matches;
}