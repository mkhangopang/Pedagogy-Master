/**
 * WORLD-CLASS SLO PARSER (v5.0)
 * Optimized for Sindh (B-09-A-01) and Federal (S8a5) standards.
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
  'C': 'Chemistry'
};

export function parseSLOCode(code: string): ParsedSLO | null {
  // Pattern 1: Sindh 2024 (B-09-A-01)
  const pattern2024 = /^([A-Z])-?(\d{2})-?([A-Z])-?(\d{2})$/i;
  // Pattern 2: Shorthand (S8a5)
  const patternShort = /^([A-Z])(\d{1,2})([A-Z])(\d{1,2})$/i;

  const match = code.match(pattern2024) || code.match(patternShort);
  
  if (!match) return null;
  
  const [_, sub, grade, domain, num] = match;
  const subUpper = sub.toUpperCase();

  return {
    original: code.toUpperCase(),
    subject: subUpper,
    subjectFull: SUBJECT_MAP[subUpper] || subUpper,
    grade: parseInt(grade).toString(),
    domain: domain.toUpperCase(),
    number: parseInt(num),
    searchable: `${subUpper}${parseInt(grade)}${domain.toUpperCase()}${parseInt(num)}`.toLowerCase()
  };
}