
/**
 * WORLD-CLASS SLO PARSER (v11.0)
 * Optimized for Sindh, Federal, and Master MD generated standards.
 */

export interface ParsedSLO {
  original: string;
  subject: string;
  subjectFull: string;
  grade: string;
  domain: string;
  chapter?: string;
  number: number;
  searchable: string;
}

const SUBJECT_MAP: Record<string, string> = {
  'S': 'Science',
  'B': 'Biology',
  'X': 'Experiment', 
  'M': 'Mathematics',
  'E': 'English',
  'SS': 'Social Studies',
  'P': 'Physics',
  'C': 'Chemistry',
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
  
  // 1. EXTENDED 5-PART: Subject(1-3) + Grade(1-2) + Domain(1) + Chapter(1-2) + Number(1-3)
  // Example: B11J1301 (B-11-J-13-01)
  const extendedPattern = /^([A-Z]{1,3})(\d{1,2})([A-Z])(\d{1,2})(\d{1,3})$/;

  // 2. STANDARD 4-PART: Subject + Grade + Domain + Number
  const standardPattern = /^([A-Z]{1,3})(\d{1,2})([A-Z])(\d{1,3})$/;
  
  // 3. LEGACY PATTERN: S8a5
  const legacyPattern = /^([A-Z])(\d{1,2})([A-Z])(\d{1,2})$/i;

  let match = cleanCode.match(extendedPattern);
  if (match) {
    const [_, sub, grade, domain, chapter, num] = match;
    const subUpper = sub.toUpperCase();
    return {
      original: code,
      subject: subUpper,
      subjectFull: SUBJECT_MAP[subUpper] || subUpper,
      grade: grade.padStart(2, '0'),
      domain: domain.toUpperCase(),
      chapter: chapter,
      number: parseInt(num, 10),
      searchable: `${subUpper}${grade.padStart(2, '0')}${domain}${chapter}${num}`
    };
  }

  match = cleanCode.match(standardPattern);
  if (!match) match = cleanCode.match(legacyPattern);
  
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
      searchable: `${subUpper}${grade.padStart(2, '0')}${domain.toUpperCase()}${parseInt(num, 10)}`
    };
  }

  return null;
}
