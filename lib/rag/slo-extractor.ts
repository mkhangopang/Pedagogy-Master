/**
 * WORLD-CLASS SLO NORMALIZER (v26.0)
 * Feature: Full K-12 Continuum Recognition (ECE to XII).
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  let cleanCode = code
    .replace(/[\u2013\u2014]/g, "-") 
    .replace(/[\[\]:()]/g, '')
    .replace(/SL0/gi, 'SLO') 
    .trim()
    .toUpperCase();
  
  // Comprehensive ECE to XII Roman Grade Mapping
  const romanMap: Record<string, string> = { 
    'I': '01', 'II': '02', 'III': '03', 'IV': '04', 'V': '05', 
    'VI': '06', 'VII': '07', 'VIII': '08', 'IX': '09', 'X': '10', 
    'XI': '11', 'XII': '12' 
  };

  Object.entries(romanMap).forEach(([roman, num]) => {
    // Match Roman numerals surrounded by dashes or spaces
    const regex = new RegExp(`([- ])${roman}([- ])`, 'g');
    cleanCode = cleanCode.replace(regex, `$1${num}$2`);
  });

  // ECE / Katchi Normalization
  if (cleanCode.includes('KATCHI') || cleanCode.includes('ECE')) {
    cleanCode = cleanCode.replace(/KATCHI|ECE/g, '00'); // ECE as Grade 00 for sorting
  }

  // Pattern A: Sindh 2024 (B-11-B-27)
  const sindhMatch = cleanCode.match(/([B-Z])\s*[-.\s]?\s*(0?0|0?1|0?2|0?3|0?4|0?5|0?6|0?7|0?8|0?9|10|11|12)\s*[-.\s]?\s*([A-Z])\s*[-.\s]?\s*(\d{1,2})/i);
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
 * CONTINUUM-SCANNER
 */
export function extractSLOCodes(text: string): string[] {
  if (!text) return [];
  const matches = new Set<string>();
  
  // Expanded pattern to catch early years and full secondary roman numerals
  const pattern = /(?:SL[O0][:-\s]*)?([B-Z]\s*[-.\s]?\s*(?:0?\d|10|11|12|I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|ECE|KATCHI)\s*[-.\s]?\s*[A-Z]\s*[-.\s]?\s*\d{1,2})|(?:\b(AO\d|LO\d|CRITERION\s[A-D])\b)/gi;
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