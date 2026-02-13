
/**
 * WORLD-CLASS SLO PARSER (v10.0)
 * Optimized for Sindh (B09A01) and Federal (S8a5) standards.
 * Supports new 5-part generated codes: B-11-J-13-01
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
  
  // ROBUST CLEANING: 
  // 1. Remove brackets [] 
  // 2. Remove "SLO" or "SL0" prefix (case insensitive)
  // 3. Remove colons, spaces, hyphens
  const cleanCode = code.toUpperCase()
    .replace(/\[|\]/g, '')
    .replace(/^\s*SL[O0][:.\s-]*/, '')
    .replace(/[:\s-]/g, '');
  
  // 1. NEW PATTERN: Subject(1-3) + Grade(2) + Domain(1) + Chapter(1-2) + Number(2-3)
  // Example: B11J1301 (B-11-J-13-01)
  const extendedPattern = /^([A-Z]{1,3})(\d{2})([A-Z])(\d{1,2})(\d{2,3})$/;

  // 2. STANDARD PATTERN: Subject + Grade + Domain + Number
  // Example: B09A01
  const standardPattern = /^([A-Z]{1,3})(\d{2})([A-Z])(\d{1,3})$/;
  
  // 3. LEGACY PATTERN: S8a5
  const legacyPattern = /^([A-Z])(\d{1,2})([A-Z])(\d{1,2})$/;

  let match = cleanCode.match(extendedPattern);
  
  if (match) {
    const [_, sub, grade, domain, chapter, num] = match;
    const subUpper = sub.toUpperCase();
    return {
      original: code.toUpperCase(),
      subject: subUpper,
      subjectFull: SUBJECT_MAP[subUpper] || subUpper,
      grade: grade, // Already 2 digits
      domain: domain.toUpperCase(),
      number: parseInt(num, 10),
      searchable: `${subUpper}${grade}${domain}${chapter}${num}`
    };
  }

  match = cleanCode.match(standardPattern);
  if (!match) match = cleanCode.match(legacyPattern);
  
  if (!match) return null;
  
  const [_, sub, grade, domain, num] = match;
  const subUpper = sub.toUpperCase();
  const subjectFull = SUBJECT_MAP[subUpper] || subUpper;

  // Format Grade: Ensure strictly 2 digits
  const gradeInt = parseInt(grade, 10);
  const gradeStr = gradeInt < 10 ? `0${gradeInt}` : `${gradeInt}`;

  return {
    original: code.toUpperCase(),
    subject: subUpper,
    subjectFull: subjectFull,
    grade: gradeStr,
    domain: domain.toUpperCase(),
    number: parseInt(num, 10),
    searchable: `${subUpper}${gradeStr}${domain.toUpperCase()}${parseInt(num, 10)}`
  };
}
