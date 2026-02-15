/**
 * WORLD-CLASS SLO PARSER (v12.0)
 * Optimized for Universal standard: [Subject][Grade][Domain][Number]
 */

export interface ParsedSLO {
  original: string;
  subject: string;
  subjectFull: string;
  grade: string;
  domain: string;
  number: number;
  searchable: string;
}

const SUBJECT_MAP: Record<string, string> = {
  'B': 'Biology',
  'P': 'Physics',
  'C': 'Chemistry',
  'M': 'Mathematics',
  'E': 'English',
  'S': 'Science',
  'CS': 'Computer Science',
  'GS': 'General Science',
  'U': 'Urdu',
  'I': 'Islamiat',
  'PS': 'Pakistan Studies',
  'BIO': 'Biology',
  'CHE': 'Chemistry',
  'PHY': 'Physics'
};

export function parseSLOCode(code: string): ParsedSLO | null {
  if (!code) return null;
  
  const cleanCode = code.toUpperCase()
    .replace(/\[|\]/g, '')
    .replace(/^\s*SL[O0][:.\s-]*/, '')
    .replace(/[:\s-]/g, '');
  
  // 1. UNIVERSAL FORMAT (v130): [SubjectChar(1)][Grade(2)][Domain(1)][Seq(2+)]
  // Example: B09A01, P11C12
  const universalPattern = /^([A-Z])(\d{2})([A-Z])(\d{1,4})$/;

  // 2. EXTENDED FORMAT: Subject(1-3) + Grade(1-2) + Domain(1) + Chapter(1-2) + Number(1-3)
  const extendedPattern = /^([A-Z]{1,3})(\d{1,2})([A-Z])(\d{1,2})(\d{1,3})$/;

  // 3. STANDARD HYPHENATED: B-11-J-01
  const standardPattern = /^([A-Z]{1,3})(\d{1,2})([A-Z])(\d{1,3})$/;

  let match = cleanCode.match(universalPattern);
  if (match) {
    const [_, sub, grade, domain, num] = match;
    return {
      original: code,
      subject: sub,
      subjectFull: SUBJECT_MAP[sub] || sub,
      grade: grade,
      domain: domain,
      number: parseInt(num, 10),
      searchable: `${sub}${grade}${domain}${num}`
    };
  }

  match = cleanCode.match(extendedPattern);
  if (match) {
    const [_, sub, grade, domain, chapter, num] = match;
    const subUpper = sub.toUpperCase();
    return {
      original: code,
      subject: subUpper,
      subjectFull: SUBJECT_MAP[subUpper] || subUpper,
      grade: grade.padStart(2, '0'),
      domain: domain.toUpperCase(),
      number: parseInt(num, 10),
      searchable: `${subUpper}${grade.padStart(2, '0')}${domain}${num}`
    };
  }

  match = cleanCode.match(standardPattern);
  if (match) {
    const [_, sub, grade, domain, num] = match;
    const subUpper = sub.toUpperCase();
    return {
      original: code,
      subject: subUpper,
      subjectFull: SUBJECT_MAP[subUpper] || subUpper,
      grade: grade.padStart(2, '0'),
      domain: domain.toUpperCase(),
      number: parseInt(num, 10),
      searchable: `${subUpper}${grade.padStart(2, '0')}${domain}${num}`
    };
  }

  return null;
}