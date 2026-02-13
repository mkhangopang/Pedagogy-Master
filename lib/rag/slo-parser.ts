
/**
 * WORLD-CLASS SLO PARSER (v7.0)
 * Optimized for Sindh (B09A01) and Federal (S8a5) standards.
 * Decodes Subject, Grade, Domain, and ID from compact alphanumerics.
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
  'X': 'Experiment', // Often used in practicals
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
  const cleanCode = code.toUpperCase().replace(/[\s-]/g, '');
  
  // Pattern 1: Sindh Compact (B09A01) or (CS10B05)
  // Subject: 1-3 letters
  // Grade: 2 digits (09, 10)
  // Domain: 1 letter
  // Number: 1-3 digits
  const compactPattern = /^([A-Z]{1,3})(\d{2})([A-Z])(\d{1,3})$/;
  
  // Pattern 2: Sindh 2024 Standard (B-09-A-01) - handled by cleanCode if dashes removed
  
  // Pattern 3: Shorthand Legacy (S8a5) -> S 8 a 5
  const shortPattern = /^([A-Z])(\d{1,2})([A-Z])(\d{1,2})$/;

  let match = cleanCode.match(compactPattern);
  
  if (!match) {
    match = cleanCode.match(shortPattern);
  }
  
  if (!match) return null;
  
  const [_, sub, grade, domain, num] = match;
  const subUpper = sub.toUpperCase();
  const subjectFull = SUBJECT_MAP[subUpper] || subUpper; // Fallback to code if not in map

  // Format Grade (ensure it looks like "09" or "9")
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
