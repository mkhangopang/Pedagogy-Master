/**
 * WORLD-CLASS SLO NORMALIZER (v27.0)
 * Feature: Hydrated UID Recognition (ENG-09-C1-1.1.1).
 */
export function normalizeSLO(code: string): string {
  if (!code) return '';
  
  let cleanCode = code
    .replace(/[\u2013\u2014]/g, "-") 
    .replace(/[\[\]:()]/g, '')
    .trim()
    .toUpperCase();
  
  // 1. Handle Hydrated UIDs (AI Generated)
  // Format: ENG-09-C1-1.1.1 or BIO-12-J-01
  if (cleanCode.match(/^[A-Z]{3}-\d{2}-[A-Z0-9]+-[\d\.]+$/)) {
    return cleanCode;
  }

  // 2. Roman Numeral Mapping
  const romanMap: Record<string, string> = { 
    'I': '01', 'II': '02', 'III': '03', 'IV': '04', 'V': '05', 
    'VI': '06', 'VII': '07', 'VIII': '08', 'IX': '09', 'X': '10', 
    'XI': '11', 'XII': '12' 
  };

  Object.entries(romanMap).forEach(([roman, num]) => {
    const regex = new RegExp(`([- ])${roman}([- ])`, 'g');
    cleanCode = cleanCode.replace(regex, `$1${num}$2`);
  });

  if (cleanCode.includes('KATCHI') || cleanCode.includes('ECE')) {
    cleanCode = cleanCode.replace(/KATCHI|ECE/g, '00');
  }

  // 3. Sindh 2024 Standard (B-11-B-27)
  const sindhMatch = cleanCode.match(/([B-Z])\s*[-.\s]?\s*(0?0|0?1|0?2|0?3|0?4|0?5|0?6|0?7|0?8|0?9|10|11|12)\s*[-.\s]?\s*([A-Z])\s*[-.\s]?\s*(\d{1,2})/i);
  if (sindhMatch) {
    return `${sindhMatch[1].toUpperCase()}-${sindhMatch[2].padStart(2, '0')}-${sindhMatch[3].toUpperCase()}-${sindhMatch[4].padStart(2, '0')}`;
  }

  return cleanCode.replace(/[\s.]+/g, '-');
}

/**
 * DEEP-SCANNER
 */
export function extractSLOCodes(text: string): string[] {
  if (!text) return [];
  const matches = new Set<string>();
  
  // Pattern A: Hydrated IDs (ENG-09-C1-1.1.1)
  const hydratedPattern = /\b([A-Z]{2,4}-\d{2}-[A-Z0-9]+-[\d\.]+)\b/g;
  
  // Pattern B: Standard Codes
  const standardPattern = /(?:SL[O0][:-\s]*)?([B-Z]\s*[-.\s]?\s*(?:0?\d|10|11|12|I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|ECE|KATCHI)\s*[-.\s]?\s*[A-Z]\s*[-.\s]?\s*\d{1,2})/gi;

  // Scan A
  const hydratedMatches = Array.from(text.matchAll(hydratedPattern));
  for (const m of hydratedMatches) matches.add(m[1]);

  // Scan B
  const standardMatches = Array.from(text.matchAll(standardPattern));
  for (const match of standardMatches) {
    const rawMatch = match[1];
    if (rawMatch) {
      const normalized = normalizeSLO(rawMatch);
      if (normalized) matches.add(normalized);
    }
  }
  
  return Array.from(matches);
}