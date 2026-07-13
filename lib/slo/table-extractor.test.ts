import { describe, it, expect } from 'vitest';
import { likelyHasMultiGradeTable } from './table-extractor';

describe('table-extractor', () => {
  it('should detect multi-grade table headers', () => {
    // Matches Class I (pattern 388) and Grade 1 (pattern 392)
    const text = 'Class I Grade 1';
    expect(likelyHasMultiGradeTable(text)).toBe(true);
  });
  
  it('should not detect simple text', () => {
    const text = 'This is just a simple paragraph without grade tables.';
    expect(likelyHasMultiGradeTable(text)).toBe(false);
  });
});
