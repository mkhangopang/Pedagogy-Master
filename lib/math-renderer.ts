
import { marked } from 'marked';
import katex from 'katex';

/**
 * NEURAL STEM RENDERER (v3.0 - NATIVE MARKED EXTENSION)
 * Integrates KaTeX directly into the Marked.js lifecycle.
 * This prevents Markdown from mangling LaTeX symbols like underscores and backslashes.
 */

const mathExtension: any = {
  name: 'math',
  level: 'inline',
  start(src: string) { return src.indexOf('$'); },
  tokenizer(src: string, tokens: any) {
    // 1. Block Math: $$ ... $$ or \[ ... \]
    const blockRules = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])/;
    const blockMatch = blockRules.exec(src);
    if (blockMatch) {
      return {
        type: 'math',
        raw: blockMatch[0],
        text: (blockMatch[1] || blockMatch[2]).trim(),
        displayMode: true
      };
    }

    // 2. Inline Math: $ ... $ or \( ... \)
    // Regex for $ ensures we don't match currency (e.g. $50) by checking content length and characters
    const inlineRules = /^(?:\$([^\$\n]+?)\$|\\\(([\s\S]+?)\\\))/;
    const inlineMatch = inlineRules.exec(src);
    if (inlineMatch) {
      const text = (inlineMatch[1] || inlineMatch[2]).trim();
      // Skip simple numbers that are likely currency
      if (inlineMatch[1] && /^\d+(\.\d+)?$/.test(text)) return undefined;
      
      return {
        type: 'math',
        raw: inlineMatch[0],
        text: text,
        displayMode: false
      };
    }
    return undefined;
  },
  renderer(token: any) {
    try {
      return katex.renderToString(token.text, {
        displayMode: token.displayMode,
        throwOnError: false,
        output: 'html',
        trust: true,
        macros: {
          "\\ce": "\\text{#1}",
          "\\unit": "\\text{#1}"
        }
      });
    } catch (e) {
      console.warn("KaTeX Error:", e);
      return token.raw;
    }
  }
};

// Initialize Marked with the Math extension globally
marked.use({ extensions: [mathExtension] });

/**
 * Renders Markdown text into STEM-safe HTML.
 */
export function renderSTEM(text: string): string {
  if (!text) return '';
  try {
    // Reset options for safety
    marked.setOptions({ gfm: true, breaks: true });
    return marked.parse(text) as string;
  } catch (e) {
    console.error("Markdown Synthesis Fault:", e);
    return text;
  }
}

// Legacy compatibility export
export const processLaTeX = (text: string) => text; 
