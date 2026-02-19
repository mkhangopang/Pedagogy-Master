import { marked } from 'marked';
import katex from 'katex';

/**
 * NEURAL STEM RENDERER (v3.4 - RALPH AUDIT FIX)
 * Integrates KaTeX into the Marked lifecycle with aggressive sanitization.
 */

const mathExtension: any = {
  name: 'math',
  level: 'inline',
  start(src: string) { 
    const match = src.match(/[\$\\]/);
    return match ? match.index : -1; 
  },
  tokenizer(src: string, tokens: any) {
    // Block: $$...$$ or \[...\]
    const blockRules = /^(?:\\?\$+([\s\S]+?)\\?\$+|\\\[([\s\S]+?)\\\])/;
    const blockMatch = blockRules.exec(src);
    if (blockMatch) {
      return {
        type: 'math',
        raw: blockMatch[0],
        text: (blockMatch[1] || blockMatch[2]).trim(),
        displayMode: true
      };
    }

    // Inline: $...$ or \(...\)
    const inlineRules = /^(?:\\?\$([^\$\n]+?)\\?\$|\\\(([\s\S]+?)\\\))/;
    const inlineMatch = inlineRules.exec(src);
    if (inlineMatch) {
      const text = (inlineMatch[1] || inlineMatch[2]).trim();
      if (inlineMatch[1] && /^\d+(\.\d+)?$/.test(text)) return undefined; // Skip money
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
      // Fix double-escaping issues where AI sends \\$ instead of $
      const cleanText = token.text
        .replace(/\\\\/g, '\\')
        .replace(/\\([\$\%&_\{\}])/g, '$1');
      
      return katex.renderToString(cleanText, {
        displayMode: token.displayMode,
        throwOnError: false,
        output: 'html',
        trust: true,
        errorColor: '#f43f5e'
      });
    } catch (e) {
      return `<span class="text-rose-500 font-mono text-xs">[LaTeX_Fault: ${token.raw}]</span>`;
    }
  }
};

marked.use({ extensions: [mathExtension] });

export function renderSTEM(text: string): string {
  if (!text) return '';
  try {
    // Pre-process: Restore dollar signs that models often escape incorrectly
    let processed = text.replace(/\\(\$)/g, '$1');
    marked.setOptions({ gfm: true, breaks: true });
    return marked.parse(processed) as string;
  } catch (e) {
    return text;
  }
}

export const processLaTeX = (text: string) => text;