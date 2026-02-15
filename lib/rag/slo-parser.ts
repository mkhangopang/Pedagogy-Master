/**
 * WORLD-CLASS SLO PARSER (v13.0)
 * Optimized for Granular Atomic Nodes: [Subject][Grade][Domain][Number].[SubNum]
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
    .replace(/\[|\]|TAG:|SLO:/g, '')
    .replace(/^\s*SL[O0][:.\s-]*/, '')
    .replace(/[:\s-]/g, '');
  
  // 1. ATOMIC UNIVERSAL FORMAT (v140): [SubjectChar(1)][Grade(2)][Domain(1)][Seq(2)].[SubSeq(1+)]
  // Example: B09A01.2, P11C12.1
  const atomicPattern = /^([A-Z])(\d{2})([A-Z])(\d{2})\.(\d+)$/;

  // 2. UNIVERSAL FORMAT (v130): B09A01
  const universalPattern = /^([A-Z])(\d{2})([A-Z])(\d{1,4})$/;

  let match = cleanCode.match(atomicPattern);
  if (match) {
    const [_, sub, grade, domain, num, subNum] = match;
    return {
      original: code,
      subject: sub,
      subjectFull: SUBJECT_MAP[sub] || sub,
      grade: grade,
      domain: domain,
      number: parseInt(num, 10),
      subNumber: parseInt(subNum, 10),
      searchable: `${sub}${grade}${domain}${num}.${subNum}`
    };
  }

  match = cleanCode.match(universalPattern);
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

  // 3. Fallback for legacy hyphenated structures
  const standardPattern = /^([A-Z]{1,3})(\d{1,2})([A-Z])(\d{1,3})$/;
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