/**
 * RECURSIVE CURRICULUM SLO POST-PROCESSING SORT UTILITY
 * Enforces strictly ascending numeric order for all SLOs in extracted curriculum objects.
 */

/**
 * Extracts the numerical suffix from an SLO's 'slo_id' or raw code string using regex.
 * Handles diverse formats such as:
 * - "SLO:B-10-M-01" -> 1
 * - "SLO:B-10-M- 08" -> 8
 * - "[SLO:B-10-J-18]" -> 18
 * - "[SLO:X-09-01]" -> 1
 * - "M09A12" -> 12
 * - "SLO:M-01-C-05" -> 5
 */
export function extractSloNumericSuffix(sloIdOrCode: string | undefined | null): number {
  if (!sloIdOrCode || typeof sloIdOrCode !== 'string') {
    return 999999;
  }

  const clean = sloIdOrCode.trim().replace(/[\[\]]/g, '');

  // 1. Primary Regex: Match numerical suffix following a separator (-, _, :, ., space) or word boundary
  const suffixMatch = clean.match(/(?:[-_:.\s]|\b)(\d{1,5})\s*$/);
  if (suffixMatch && suffixMatch[1]) {
    return parseInt(suffixMatch[1], 10);
  }

  // 2. Secondary Regex: Match alphanumeric code with trailing digits (e.g. M09A08, B10M17)
  const codeMatch = clean.match(/[A-Za-z]+(\d{1,5})\s*$/);
  if (codeMatch && codeMatch[1]) {
    return parseInt(codeMatch[1], 10);
  }

  // 3. Fallback: Find all sequences of digits and select the last one
  const allDigitGroups = clean.match(/\d+/g);
  if (allDigitGroups && allDigitGroups.length > 0) {
    return parseInt(allDigitGroups[allDigitGroups.length - 1], 10);
  }

  return 999999;
}

/**
 * Sorts an array of SLO objects in strictly ascending numerical order based on 'slo_id' suffix.
 */
export function sortSloArray<T extends Record<string, any>>(slos: T[]): T[] {
  if (!Array.isArray(slos)) return slos;

  return [...slos].sort((a, b) => {
    const idA = a.slo_id || a.original_code || a.slo_code || a.code || '';
    const idB = b.slo_id || b.original_code || b.slo_code || b.code || '';

    const numA = extractSloNumericSuffix(idA);
    const numB = extractSloNumericSuffix(idB);

    if (numA !== numB) {
      return numA - numB;
    }

    // Fallback: stable secondary sort by string if numbers are identical
    return String(idA).localeCompare(String(idB));
  });
}

/**
 * Performs a deep recursive traversal of a curriculum data structure to ensure:
 * 1. Every 'slos' array is numerically sorted by 'slo_id' suffix in strictly ascending order.
 * 2. 'domains' dictionaries are ordered alphabetically (A -> Z, with 'X' at the end).
 * 3. 'grades' dictionaries are ordered in ascending numerical order ('01', '02', ... '09', '10', '11', '12').
 */
export function sortCurriculumObjectRecursively(target: any): any {
  if (target === null || typeof target !== 'object') {
    return target;
  }

  if (Array.isArray(target)) {
    // If this is an array of SLO items, sort it
    const isSloArray = target.length > 0 && target.every(item => item && typeof item === 'object' && ('slo_id' in item || 'original_code' in item || 'slo_code' in item));
    if (isSloArray) {
      return sortSloArray(target).map(item => sortCurriculumObjectRecursively(item));
    }
    return target.map(item => sortCurriculumObjectRecursively(item));
  }

  const result: Record<string, any> = {};

  // Sort keys if this object represents 'grades' or 'domains'
  let keys = Object.keys(target);

  const isGradesContainer = keys.some(k => /^\d{1,2}$/.test(k) || /^grade\s*\d+/i.test(k));
  const isDomainsContainer = keys.some(k => /^[A-Z]$/.test(k));

  if (isGradesContainer) {
    keys = keys.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });
  } else if (isDomainsContainer) {
    keys = keys.sort((a, b) => {
      if (a === 'X' && b !== 'X') return 1;
      if (b === 'X' && a !== 'X') return -1;
      return a.localeCompare(b);
    });
  }

  for (const key of keys) {
    const value = target[key];

    if (key === 'slos' && Array.isArray(value)) {
      result[key] = sortSloArray(value).map(item => sortCurriculumObjectRecursively(item));
    } else {
      result[key] = sortCurriculumObjectRecursively(value);
    }
  }

  return result;
}
