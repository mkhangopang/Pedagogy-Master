/**
 * WORLD-CLASS SLO NORMALIZER (v25.0)
 * Feature: International & Local Hybrid Recognition.
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  let cleanCode = code
    .replace(/[\u2013\u2014]/g, "-") 
    .replace(/[\[\]:()]/g, '')
    .replace(/SL0/gi, 'SLO') // Fix common OCR zero-typo
    .trim()
    .toUpperCase();
  
  // Sindh/Federal Roman Grade Mapping
  const romanMap: Record<string, string> = { 'IX': '09', 'X': '10', 'XI': '11', 'XII': '12' };
  Object.entries(romanMap).forEach(([roman, num]) => {
    const regex = new RegExp(`-(${roman})-`, 'g');
    cleanCode = cleanCode.replace(regex, `-${num}-`);
  });

  // Pattern A: Sindh 2024 (B-11-B-27)
  const sindhMatch = cleanCode.match(/([B-Z])\s*[-.\s]?\s*(0?9|10|11|12)\s*[-.\s]?\s*([A-Z])\s*[-.\s]?\s*(\d{1,2})/i);
  if (sindhMatch) {
    return `${sindhMatch[1].toUpperCase()}-${sindhMatch[2].padStart(2, '0')}-${sindhMatch[3].toUpperCase()}-${sindhMatch[4].padStart(2, '0')}`;
  }

  // Pattern B: International Criterion (AO1.1, Criterion A)
  const intlMatch = cleanCode.match(/(AO|CRITERION|LO)\s*[-.\s]?\s*([A-Z0-9.]+)/i);
  if (intlMatch) {
    return `${intlMatch[1].toUpperCase()}-${intlMatch[2]}`;
  }

  return cleanCode.replace(/[\s.]+/g, '-');
}

/**
 * GRID-SCANNER
 */
export function extractSLOCodes(text: string): string[] {
  if (!text) return [];
  const matches = new Set<string>();
  
  // Comprehensive Alphanumeric Standard Pattern
  const pattern = /(?:SL[O0][:-\s]*)?([B-Z]\s*[-.\s]?\s*(?:0?9|10|11|12|IX|X|XI|XII|IV|V|VI|VII|VIII)\s*[-.\s]?\s*[A-Z]\s*[-.\s]?\s*\d{1,2})|(?:\b(AO\d|LO\d|CRITERION\s[A-D])\b)/gi;
  const rawMatches = Array.from(text.matchAll(pattern));
  
  for (const match of rawMatches) {
    const rawMatch = match[1] || match[2];
    if (rawMatch) {
      const normalized = normalizeSLO(rawMatch);
      if (normalized) matches.add(normalized);
    }
  }
  
  return Array.from(matches);
}