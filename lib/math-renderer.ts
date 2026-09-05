import { marked } from 'marked';
import katex from 'katex';

/**
 * NEURAL STEM RENDERER (v4.0 - HIGH-FIDELITY NUMERACY & LATEX)
 * Integrates KaTeX into the Marked lifecycle with aggressive sanitization
 * and stripping of spurious dollar signs on cardinal numbers and simple symbols.
 */

const mathExtension: any = {
  name: 'math',
  level: 'inline',
  start(src: string) { 
    const match = src.match(/[\$\\]/);
    return match ? match.index : -1; 
  },
  tokenizer(src: string) {
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
      
      // Strip simple numbers or elementary math so they render as clean inline text
      if (/^[0-9\s+=><\-*/.%]+$/.test(text) && /[0-9]/.test(text)) {
        return {
          type: 'text',
          raw: inlineMatch[0],
          text: text
        };
      }
      if (/^[<>=,\s]+$/.test(text) || /^\\langle\s*,\s*\\rangle$/.test(text)) {
        return {
          type: 'text',
          raw: inlineMatch[0],
          text: text.replace(/\\langle/g, '<').replace(/\\rangle/g, '>')
        };
      }
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
    if (token.type === 'text') {
      return token.text;
    }
    try {
      const cleanText = token.text
        .replace(/\\\\/g, '\\')
        .replace(/\\(\$)/g, '$1');
      
      return katex.renderToString(cleanText, {
        displayMode: token.displayMode,
        throwOnError: false,
        output: 'html',
        trust: true,
        errorColor: '#f43f5e'
      });
    } catch {
      return token.text || token.raw;
    }
  }
};

marked.use({ extensions: [mathExtension] });

export function renderSTEM(text: string): string {
  if (!text) return '';
  try {
    // 1. Temporarily stash escaped dollar signs (currency)
    let processed = text.replace(/\\(\$)/g, '___ESC_DOLLAR___');

    // 2. Clean spurious dollar signs around plain numbers, percentages, and simple math
    processed = processed.replace(/\$([0-9\s+=><\-*/.%\\]+)\$/g, (match, p1) => {
      const unescaped = p1.replace(/\\([$%])/g, '$1');
      if (/^[0-9\s+=><\-*/.%]+$/.test(unescaped) && /[0-9]/.test(unescaped)) {
        return unescaped;
      }
      return match;
    });

    // 3. Clean ranges: e.g. $0-99$ or $0$ through $9$
    processed = processed.replace(/\$(\d+\s*[-–—to]+\s*\d+)\$/g, '$1');

    // 4. Clean relational comparison symbols: e.g. $<, >, =$ or $<>$
    processed = processed.replace(/\$([<>=,\s]+)\$/g, (_m, s) => s.trim());
    processed = processed.replace(/\$(\\langle\s*,\s*\\rangle)\$/g, '<, >');

    // 5. Restore literal dollar signs
    processed = processed.replace(/___ESC_DOLLAR___/g, '$');

    // Use marked.use for options as setOptions is deprecated
    marked.use({ gfm: true, breaks: true });
    return marked.parse(processed) as string;
  } catch {
    return text;
  }
}

export const processLaTeX = (text: string) => text;