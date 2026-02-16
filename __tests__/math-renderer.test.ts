import { renderSTEM } from '../lib/math-renderer';

// Fix: Declared Jest globals to resolve "Cannot find name" errors in test environment
declare var describe: any;
declare var it: any;
declare var expect: any;

describe('Math Renderer Resilience', () => {
  it('should handle double escaped dollar signs', () => {
    const input = '\\\\$E=mc^2\\\\$';
    const output = renderSTEM(input);
    expect(output).toContain('katex');
  });

  it('should handle standard block math', () => {
    const input = '$$x + y = z$$';
    const output = renderSTEM(input);
    expect(output).toContain('katex-display');
  });
});