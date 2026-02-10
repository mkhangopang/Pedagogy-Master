
import { marked } from 'marked';
import katex from 'katex';

/**
 * NEURAL STEM RENDERER (v3.1 - ENHANCED)
 * Integrates KaTeX directly into the Marked.js lifecycle.
 * v3.1: Improved tokenizer 'start' logic and robust error visual cues.
 */

const mathExtension: any = {
  name: 'math',
  level: 'inline',
  start(src: string) { 
    // Improved start detection to include LaTeX backslash escapes
    const match = src.match(/[\$\\]/);
    return match ? match.index : -1; 
  },
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
    const inlineRules = /^(?:\$([^\$\n]+?)\$|\\\(([\s\S]+?)\\\))/;
    const inlineMatch = inlineRules.exec(src);
    if (inlineMatch) {
      const text = (inlineMatch[1] || inlineMatch[2]).trim();
      // Skip simple numbers that are likely currency ($50)
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
        errorColor: '#f43f5e', // Professional rose-500 for error highlighting
        macros: {
          "\\ce": "\\text{#1}",
          "\\unit": "\\text{#1}"
        }
      });
    } catch (e) {
      console.warn("KaTeX Error:", e);
      // Return raw text with error indicator for user transparency
      return `<span class="text-rose-500 border-b border-dotted border-rose-500" title="Math Rendering Error">${token.raw}</span>`;
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
    // Reset options for safety and GFM compliance
    marked.setOptions({ gfm: true, breaks: true });
    return marked.parse(text) as string;
  } catch (e) {
    console.error("Markdown Synthesis Fault:", e);
    return text;
  }
}

// Legacy compatibility export
export const processLaTeX = (text: string) => text;
