
import { generateCurriculumJson } from './json-generator';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  metadata?: {
    board: string;
    subject: string;
    grade: string;
    version: string;
  };
}

/**
 * Adaptive Markdown Validator (v9.0)
 * Ultra-Robust version for Sindh & International Standards.
 */
export function validateCurriculumMarkdown(content: string): ValidationResult {
  const errors: string[] = [];
  
  // 1. Metadata Presence (Compulsory)
  if (!content.includes('# Curriculum Metadata')) {
    errors.push("Header '# Curriculum Metadata' is missing.");
  }

  // 2. Metadata Extraction (Flexible Key-Value)
  const boardMatch = content.match(/Board:\s*([^\n\r]+)/i);
  const subjectMatch = content.match(/Subject:\s*([^\n\r]+)/i);
  const gradeMatch = content.match(/Grade:\s*([^\n\r]+)/i);
  const versionMatch = content.match(/Version:\s*([^\n\r]+)/i);

  if (!boardMatch) errors.push("Metadata 'Board:' missing.");
  if (!subjectMatch) errors.push("Metadata 'Subject:' missing.");
  if (!gradeMatch) errors.push("Metadata 'Grade:' missing.");

  // 3. Adaptive Hierarchical Sections
  // Robust check: Allows # Unit OR Unit X at start of line
  const unitRegex = /^(?:#{1,3}\s+)?(Unit|Chapter|Section|Module|Domain|Grade|Grade\s+\w+)\b/gim;
  const unitMatches = Array.from(content.matchAll(unitRegex));
  
  if (unitMatches.length === 0) {
    errors.push("No hierarchy found. Curriculum must be organized into units or domains (e.g. # Unit 1).");
  }

  // 4. Adaptive SLO Detection
  // Matches patterns like: - SLO:S-04-A-01, - SLO: S8a5, etc.
  const sloRegex = /^- SLO\s*[:\s]*([^:\n]+)[:\s]*(.+)/gim;
  const sloMatches = Array.from(content.matchAll(sloRegex));
  if (sloMatches.length === 0) {
    errors.push("No Student Learning Objectives (SLOs) detected. Requirement: '- SLO:CODE: Description'");
  }

  // 5. Standards Grid Compliance
  // Adaptive standard detection
  const standardRegex = /^(?:#{2,4}\s+)?Standard:\s*([^\n\r]+)/gim;
  const standardMatches = Array.from(content.matchAll(standardRegex));
  if (standardMatches.length === 0) {
    errors.push("Missing 'Standard: [ID]' blocks required for neural indexing.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    metadata: boardMatch && subjectMatch && gradeMatch ? {
      board: boardMatch[1].trim(),
      subject: subjectMatch[1].trim(),
      grade: gradeMatch[1].trim(),
      version: versionMatch ? versionMatch[1].trim() : "2024"
    } : undefined
  };
}
