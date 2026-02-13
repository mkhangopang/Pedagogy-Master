
/**
 * WORLD-CLASS SLO PARSER (v8.0)
 * Optimized for Sindh (B09A01) and Federal (S8a5) standards.
 * LOGIC: Subject(Char) -> Grade(2Digits) -> Domain(Char) -> Number(Digits)
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
  
  // Normalize: Remove spaces, dashes for parsing logic
  // e.g. "B-09-A-01" -> "B09A01"
  const cleanCode = code.toUpperCase().replace(/[\s-]/g, '');
  
  // PATTERN: Subject (1-3 chars) + Grade (2 chars) + Domain (1 char) + Number (1-3 chars)
  // Example: B09A01
  // Group 1 (Subject): B
  // Group 2 (Grade): 09
  // Group 3 (Domain): A
  // Group 4 (Number): 01
  const standardPattern = /^([A-Z]{1,3})(\d{2})([A-Z])(\d{1,3})$/;
  
  // Legacy Pattern (e.g. S8a5 -> S 8 a 5)
  const legacyPattern = /^([A-Z])(\d{1,2})([A-Z])(\d{1,2})$/;

  let match = cleanCode.match(standardPattern);
  
  if (!match) {
    match = cleanCode.match(legacyPattern);
  }
  
  if (!match) return null;
  
  const [_, sub, grade, domain, num] = match;
  const subUpper = sub.toUpperCase();
  const subjectFull = SUBJECT_MAP[subUpper] || subUpper;

  // Format Grade: Ensure strictly 2 digits (e.g., 9 -> 09) for sorting safety
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
