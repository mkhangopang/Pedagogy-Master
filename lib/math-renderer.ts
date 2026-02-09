
import katex from 'katex';

/**
 * NEURAL MATH RENDERER (v1.0)
 * Specialized for Science, Technology, and Math (STEM) artifact fidelity.
 */
export function processLaTeX(text: string): string {
  if (!text) return '';

  let processed = text;

  // 1. Handle Block Math: $$ latex $$
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula.trim(), {
        displayMode: true,
        throwOnError: false
      });
    } catch (e) {
      return match;
    }
  });

  // 2. Handle Inline Math: $ latex $
  // Regex ensures we don't match currency values (e.g., $50) by checking for word boundary or symbols
  processed = processed.replace(/(?<!\\)\$([^\$]+?)\$/g, (match, formula) => {
    // Basic heuristic: if it looks like just a number/currency, skip it
    if (/^\d+(\.\d+)?$/.test(formula)) return match;
    
    try {
      return katex.renderToString(formula.trim(), {
        displayMode: false,
        throwOnError: false
      });
    } catch (e) {
      return match;
    }
  });

  return processed;
}
