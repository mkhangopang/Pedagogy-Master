import { marked } from 'marked';
import katex from 'katex';

/**
 * NEURAL STEM RENDERER (v3.6)
 * Optimized for resilience against AI-generated double escapes.
 */

const mathExtension: any = {
  name: 'math',
  level: 'inline',
  start(src: string) { return src.match(/[\$\\]/)?.index; },
  tokenizer(src: string) {
    // Detect block math with potential double escapes
    const blockRules = /^(?:\\{0,2}\$\$([\s\S]+?)\\{0,2}\$\$|\\\[([\s\S]+?)\\\])/;
    const blockMatch = blockRules.exec(src);
    if (blockMatch) {
      return {
        type: 'math',
        raw: blockMatch[0],
        text: (blockMatch[1] || blockMatch[2]).trim(),
        displayMode: true
      };
    }

    // Inline math with potential double escapes
    const inlineRules = /^(?:\\{0,2}\$([^\$\n]+?)\\{0,2}\$|\\\(([\s\S]+?)\\\))/;
    const inlineMatch = inlineRules.exec(src);
    if (inlineMatch) {
      const text = (inlineMatch[1] || inlineMatch[2]).trim();
      return {
        type: 'math',
        raw: inlineMatch[0],
        text: text,
        displayMode: false
      };
    }
  },
  renderer(token: any) {
    try {
      return katex.renderToString(token.text.replace(/\\\\/g, '\\'), {
        displayMode: token.displayMode,
        throwOnError: false
      });
    } catch (e) {
      return token.raw;
    }
  }
};

marked.use({ extensions: [mathExtension] });

export function renderSTEM(text: string): string {
  if (!text) return '';
  try {
    // Pre-normalization: Fix most common AI escape artifacts
    const processed = text.replace(/\\\\(\$)/g, '$1').replace(/\\(\$)/g, '$1');
    return marked.parse(processed) as string;
  } catch (e) {
    return text;
  }
}