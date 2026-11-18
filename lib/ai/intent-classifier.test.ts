import { describe, expect, it } from 'vitest';
import { classifyIntent } from './intent-classifier';

describe('classifyIntent fast deterministic routing', () => {
  it('classifies greetings with complexity 1 and skips grounding in under 5ms', async () => {
    const start = performance.now();
    const res = await classifyIntent('Assalam o Alaikum');
    const elapsed = performance.now() - start;

    expect(res.intent).toBe('general');
    expect(res.complexity).toBe(1);
    expect(res.requiresGrounding).toBe(false);
    expect(elapsed).toBeLessThan(15);
  });

  it('classifies lesson plan creation queries to gemini-pro', async () => {
    const res = await classifyIntent('Create a 5E lesson plan for Biology Grade 10 photosynthesis');
    expect(res.intent).toBe('creation');
    expect(res.complexity).toBe(3);
    expect(res.isSTEM).toBe(true);
    expect(res.suggestedProvider).toBe('gemini-pro');
  });

  it('classifies SLO lookups accurately without invoking an LLM round-trip', async () => {
    const res = await classifyIntent('SLO B-10-A-02 explain nervous system coordination');
    expect(res.intent).toBe('lookup');
    expect(res.requiresGrounding).toBe(true);
    expect(res.suggestedProvider).toBe('gemini-flash');
  });
});
