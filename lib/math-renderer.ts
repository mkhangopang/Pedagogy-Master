
import { marked } from 'marked';
import katex from 'katex';

/**
 * NEURAL STEM RENDERER (v3.3)
 * Integrates KaTeX directly into the Marked.js lifecycle.
 * v3.3: Improved resilience against escaped dollar signs and multi-line detection.
 */

const mathExtension: any = {
  name: 'math',
  level: 'inline',
  start(src: string) { 
    // Detect start of math block even if preceded by backslash (AI quirk)
    const match = src.match(/[\$\\]/);
    return match ? match.index : -1; 
  },
  tokenizer(src: string, tokens: any) {
    // 1. Block Math: $$ ... $$ or \[ ... \]
    // Handles cases where AI might try to escape the delimiters
    const blockRules = /^(?:\\?\$+([\s\S]+?)\\?\$+|\\\[([\s\S]+?)\\\])/;
    const blockMatch = blockRules.exec(src);
    if (blockMatch) {
      return {
        type: 'math',
        raw: blockMatch[0],
        text: (blockMatch[1] || blockMatch[2]).trim().replace(/\\/g, '\\'), // Ensure backslashes are preserved
        displayMode: true
      };
    }

    // 2. Inline Math: $ ... $ or \( ... \)
    const inlineRules = /^(?:\\?\$([^\$\n]+?)\\?\$|\\\(([\s\S]+?)\\\))/;
    const inlineMatch = inlineRules.exec(src);
    if (inlineMatch) {
      const text = (inlineMatch[1] || inlineMatch[2]).trim();
      
      // Skip simple numbers that are likely currency ($50) or lists
      if (inlineMatch[1] && /^\d+(\.\d+)?$/.test(text)) return undefined;
      
      // Prevent matching empty dollar signs
      if (!text) return undefined;

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
      // Cleanup escaped LaTeX symbols if they leaked into the text
      const cleanText = token.text.replace(/\\([\$%&_\{}])/g, '$1');
      
      return katex.renderToString(cleanText, {
        displayMode: token.displayMode,
        throwOnError: false,
        output: 'html',
        trust: true,
        errorColor: '#f43f5e',
        macros: {
          "\\ce": "\\text{#1}",
          "\\unit": "\\text{#1}",
          "\\degree": "^{\\circ}"
        }
      });
    } catch (e) {
      console.warn("KaTeX Error:", e);
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
    // Before parsing, handle double escaped dollar signs which sometimes bypass tokenizers
    let processed = text.replace(/\\(\$)/g, '$1');
    
    marked.setOptions({ gfm: true, breaks: true });
    return marked.parse(processed) as string;
  } catch (e) {
    console.error("Markdown Synthesis Fault:", e);
    return text;
  }
}

// Legacy compatibility export
export const processLaTeX = (text: string) => text;
