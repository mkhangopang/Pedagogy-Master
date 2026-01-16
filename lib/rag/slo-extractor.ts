/**
 * Extracts SLO codes from user queries
 * Matches patterns: S8A5, S-08-A-05, s8a5, S-04-A-01
 */
export function extractSLOCodes(query: string): string[] {
  if (!query) return [];
  
  // Pattern matches: S + digits + letter + digits (with optional hyphens)
  const patterns = [
    /S-?\d{1,2}-?[A-Za-z]-?\d{1,2}/gi,  // S8A5, S-08-A-05
    /SLO[:\s]*S-?\d{1,2}-?[A-Za-z]-?\d{1,2}/gi  // SLO: S8A5, SLO S-08-A-05
  ];
  
  const matches: string[] = [];
  
  patterns.forEach(pattern => {
    const found = query.match(pattern);
    if (found) {
      found.forEach(match => {
        // Clean up: remove "SLO:" prefix, normalize format
        const cleaned = match
          .replace(/SLO[:\s]*/i, '')
          .toUpperCase()
          .replace(/-/g, '');  // Remove hyphens for consistency
        
        if (!matches.includes(cleaned)) {
          matches.push(cleaned);
        }
      });
    }
  });
  
  return matches;
}