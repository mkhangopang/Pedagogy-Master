
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
 * Adaptive Markdown Validator (v7.0)
 * Enforces a hierarchical structure while allowing flexible formatting.
 */
export function validateCurriculumMarkdown(content: string): ValidationResult {
  const errors: string[] = [];
  
  // 1. Metadata Presence
  if (!content.includes('# Curriculum Metadata')) {
    errors.push("Missing '# Curriculum Metadata' header at the top.");
  }

  // 2. Metadata Extraction (Adaptive Regex)
  const boardMatch = content.match(/Board:\s*([^\n\r]+)/i);
  const subjectMatch = content.match(/Subject:\s*([^\n\r]+)/i);
  const gradeMatch = content.match(/Grade:\s*([^\n\r]+)/i);
  const versionMatch = content.match(/Version:\s*([^\n\r]+)/i);

  if (!boardMatch) errors.push("Metadata 'Board:' is missing.");
  if (!subjectMatch) errors.push("Metadata 'Subject:' is missing.");
  if (!gradeMatch) errors.push("Metadata 'Grade:' is missing.");

  // 3. Structural Hierarchy (Units)
  // Adaptive check for Unit headers (allows Unit 1, Unit: 1, Unit - 1, etc)
  const unitRegex = /^#\s+(Unit|Chapter|Section|Module)\s*[:\d-]*\s*(.+)/gim;
  const unitMatches = Array.from(content.matchAll(unitRegex));
  
  if (unitMatches.length === 0) {
    errors.push("Missing hierarchical sections. Please use '# Unit: [Name]' to group content.");
  }

  // 4. Learning Outcomes / SLOs
  const sloRegex = /^- SLO\s*[:\s]*([^:\n]+)[:\s]*(.+)/gim;
  const sloMatches = Array.from(content.matchAll(sloRegex));
  if (sloMatches.length === 0) {
    errors.push("No Student Learning Objectives (SLOs) detected. Format: '- SLO:CODE: Description'");
  }

  // 5. Standards / Detailed Breakdown
  const standardRegex = /^### Standard:\s*([^\n\r]+)/gim;
  const standardMatches = Array.from(content.matchAll(standardRegex));
  if (standardMatches.length === 0) {
    errors.push("Missing '### Standard: [ID]' sections for detailed RAG indexing.");
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
