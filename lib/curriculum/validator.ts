
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
 * Institutional Markdown Validator (v6.0)
 * Enforces strict template structure: Metadata -> Units -> Outcomes -> Standards
 */
export function validateCurriculumMarkdown(content: string): ValidationResult {
  const errors: string[] = [];
  
  // 1. Mandatory Header Check
  if (!content.includes('# Curriculum Metadata')) {
    errors.push("Missing required top-level header: '# Curriculum Metadata'");
  }

  // 2. Metadata Field Extraction & Validation
  const board = content.match(/Board:\s*(.+)/i)?.[1];
  const subject = content.match(/Subject:\s*(.+)/i)?.[1];
  const grade = content.match(/Grade:\s*(.+)/i)?.[1];
  const version = content.match(/Version:\s*(.+)/i)?.[1];

  if (!board) errors.push("Metadata field 'Board:' is missing or empty.");
  if (!subject) errors.push("Metadata field 'Subject:' is missing or empty.");
  if (!grade) errors.push("Metadata field 'Grade:' is missing or empty.");

  // 3. Structural Integrity
  const unitCount = (content.match(/^# Unit/gm) || []).length;
  if (unitCount === 0) errors.push("No '# Unit' headers detected. A curriculum must have at least one unit.");

  const outcomeCount = (content.match(/^## Learning Outcomes/gm) || []).length;
  if (outcomeCount === 0) errors.push("Missing '## Learning Outcomes' sections under units.");

  // 4. Standard ID Constraint
  const standardMatches = content.match(/^### Standard:\s*([A-Z0-9.-]+)/gm);
  if (!standardMatches) {
    errors.push("No Standards identified. Every standard must be prefixed with '### Standard: [ID]'.");
  } else {
    // Check for ID formatting (Should not be empty)
    standardMatches.forEach(match => {
      const id = match.replace('### Standard:', '').trim();
      if (!id) errors.push("Detected an empty 'Standard' ID. All standards must have unique alphanumeric IDs.");
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    metadata: board && subject && grade && version ? {
      board: board.trim(),
      subject: subject.trim(),
      grade: grade.trim(),
      version: version.trim()
    } : undefined
  };
}
