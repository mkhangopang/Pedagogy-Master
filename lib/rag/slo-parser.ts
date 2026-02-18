/**
 * WORLD-CLASS SLO PARSER (v14.0)
 * Optimized for Sindh/Federal Standards: [SubjectChar][Grade2][DomainChar][Sequence2]
 */

export interface ParsedSLO {
  original: string;
  subject: string;
  subjectFull: string;
  grade: string;
  domain: string;
  number: number;
  subNumber?: number;
  searchable: string;
}

const SUBJECT_MAP: Record<string, string> = {
  'B': 'Biology', 'P': 'Physics', 'C': 'Chemistry', 'M': 'Mathematics',
  'E': 'English', 'S': 'Science', 'CS': 'Computer Science', 'GS': 'General Science',
  'U': 'Urdu', 'I': 'Islamiat', 'PS': 'Pakistan Studies', 'BIO': 'Biology',
  'CHE': 'Chemistry', 'PHY': 'Physics'
};

export function parseSLOCode(code: string): ParsedSLO | null {
  if (!code) return null;
  
  const cleanCode = code.toUpperCase()
    .replace(/\[|\]|TAG:|SLO:/g, '')
    .replace(/^\s*SL[O0][:.\s-]*/, '')
    .trim();
  
  // 1. UNIVERSAL CONCATENATED: B09A01
  const universalPattern = /^([A-Z])(\d{2})([A-Z])(\d{2,4})$/;
  // 2. HYPHENATED SINDH: B-09-A-01
  const hyphenatedPattern = /^([A-Z])-?(\d{2})-?([A-Z])-?(\d{2,4})$/;

  let match = cleanCode.match(universalPattern) || cleanCode.match(hyphenatedPattern);
  
  if (match) {
    const [_, sub, grade, domain, num] = match;
    return {
      original: code,
      subject: sub,
      subjectFull: SUBJECT_MAP[sub] || sub,
      grade: grade,
      domain: domain,
      number: parseInt(num, 10),
      searchable: `${sub}${grade}${domain}${num.padStart(2, '0')}`
    };
  }

  return null;
}