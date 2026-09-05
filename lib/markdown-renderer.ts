// lib/markdown-renderer.ts
// Pure markdown -> HTML converter with high-fidelity STEM math processing
// Handles: # headings, **bold**, *italic*, | tables |, - lists, 1. lists,
//          --- dividers, `inline code`, ```code blocks```, blockquotes (>), KaTeX math
import katex from 'katex';

export function markdownToHtml(md: string): string {
  if (!md) return '';

  // -- 1. Stash Code Blocks & Inline Code --------------------------------------
  const codePlaceholders: string[] = [];
  const pushCode = (snippet: string) => {
    const ph = `___CODE_SLOT_${codePlaceholders.length}___`;
    codePlaceholders.push(snippet);
    return ph;
  };

  let html = md.replace(
    /```([a-z0-9_-]*)\n?([\s\S]*?)```/gi,
    (_m, lang, code) => {
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const langAttr = lang ? ` data-lang="${lang}"` : '';
      return pushCode(
        `<pre${langAttr} style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:12px 0;overflow-x:auto;font-size:12px;font-family:monospace;white-space:pre-wrap;color:#334155"><code>${escaped}</code></pre>`
      );
    }
  );

  html = html.replace(/`([^`\n]+)`/g, (_m, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return pushCode(
      `<code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px;font-family:monospace;color:#4338ca">${escaped}</code>`
    );
  });

  // -- 2. Handle Escaped Dollars (Literal Currency $) -------------------------
  html = html.replace(/\\(\$)/g, '___ESC_DOLLAR___');

  // -- 3. High-Fidelity Math Pre-Processing & Tokenization --------------------
  const mathPlaceholders: string[] = [];
  const pushMath = (rendered: string) => {
    const ph = `___MATH_SLOT_${mathPlaceholders.length}___`;
    mathPlaceholders.push(rendered);
    return ph;
  };

  const cleanMathBlock = (raw: string) => {
    const trimmed = raw.trim().replace(/\\([$%])/g, '$1');
    try {
      const rendered = katex.renderToString(trimmed, {
        displayMode: true,
        throwOnError: false,
        output: 'html',
        trust: true
      });
      return pushMath(`<div style="margin: 1.25rem 0; overflow-x: auto; text-align: center;">${rendered}</div>`);
    } catch {
      const safe = trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return pushMath(`<div style="margin: 1.25rem 0; text-align: center; font-family: monospace;">${safe}</div>`);
    }
  };

  const cleanMathInline = (raw: string) => {
    let math = raw.trim().replace(/\\([$%])/g, '$1');

    // Case A: Isolated cardinal number, decimal, range, count, or percentage (e.g., 0, 99, 85%, 43, 0-99, 0 to 9)
    if (/^[-+]?\d+(?:\.\d+)?%?$/.test(math) || /^\d+\s*[-–—to]+\s*\d+$/.test(math)) {
      return math;
    }

    // Case B: Comparison symbols or tuple (e.g., <, >, =, <, >, =, \langle, \rangle)
    if (/^[<>=,\s]+$/.test(math) || /^\\langle\s*,\s*\\rangle$/.test(math)) {
      return math
        .replace(/\\langle/g, '<')
        .replace(/\\rangle/g, '>')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    // Case C: Elementary arithmetic / place value (e.g. 34 = 30 + 4, 52 > 25, 64 > 46, 20 + 5 = 25)
    if (/^[0-9\s+=><\-*/.%]+$/.test(math) && /[0-9]/.test(math)) {
      return math
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    // Case D: Authentic LaTeX expression (e.g., \frac, \sqrt, powers, variables, sums)
    try {
      const rendered = katex.renderToString(math, {
        displayMode: false,
        throwOnError: false,
        output: 'html',
        trust: true
      });
      return pushMath(rendered);
    } catch {
      return math
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  };

  // Extract block math ($$ ... $$ or \[ ... \])
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_m, m) => cleanMathBlock(m));
  html = html.replace(/\\\[([\s\S]+?)\\\]/g, (_m, m) => cleanMathBlock(m));

  // Extract inline math ($ ... $ or \( ... \))
  html = html.replace(/\$([^\$\n]+?)\$/g, (_m, m) => cleanMathInline(m));
  html = html.replace(/\\\(([\s\S]+?)\\\)/g, (_m, m) => cleanMathInline(m));

  // -- 4. Standard HTML Entity Escapes ----------------------------------------
  html = html
    .replace(/&/g, '&amp;')
    .replace(/<br\s*\/?>/gi, '___BR_TAG___')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/___BR_TAG___/g, '<br/>');

  // -- 5. Blockquotes (> Teacher Script / Callouts) ---------------------------
  html = html.replace(
    /^&gt; (.*)$/gm,
    '<blockquote style="border-left:4px solid #6366f1;padding:8px 16px;margin:12px 0;background:#f8faff;border-radius:0 8px 8px 0;color:#334155;font-style:italic;line-height:1.6">$1</blockquote>'
  );

  // -- 6. Headings ------------------------------------------------------------
  html = html.replace(
    /^# (.+)$/gm,
    '<h1 style="font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:0.04em;color:#0f172a;margin:28px 0 12px;padding-bottom:8px;border-bottom:2px solid #4f46e5">$1</h1>'
  );
  html = html.replace(
    /^## (.+)$/gm,
    '<h2 style="font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:0.03em;color:#1e293b;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0">$1</h2>'
  );
  html = html.replace(
    /^### (.+)$/gm,
    '<h3 style="font-size:13px;font-weight:800;color:#4338ca;margin:16px 0 6px">$1</h3>'
  );
  html = html.replace(
    /^#### (.+)$/gm,
    '<h4 style="font-size:12px;font-weight:700;color:#334155;margin:12px 0 4px">$1</h4>'
  );

  // -- 7. Horizontal rules ----------------------------------------------------
  html = html.replace(
    /^---$/gm,
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>'
  );

  // -- 8. Bold + Italic -------------------------------------------------------
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="font-weight:800;color:#0f172a">$1</strong>'
  );
  html = html.replace(
    /\*([^*\n]+)\*/g,
    '<em style="font-style:italic;color:#475569">$1</em>'
  );

  // -- 9. Tables --------------------------------------------------------------
  html = html.replace(/((?:\|.+\|\n?)+)/g, (block) => {
    const rows = block
      .trim()
      .split('\n')
      .filter((r) => r.trim() && !/^\|[-| :]+\|$/.test(r.trim()));
    if (rows.length === 0) return block;

    const tableStyle =
      'width:100%;border-collapse:collapse;margin:12px 0;font-size:12px';
    const thStyle =
      'background:#eef2ff;color:#3730a3;font-weight:800;text-transform:uppercase;font-size:10px;letter-spacing:0.06em;padding:8px 12px;border:1px solid #c7d2fe;text-align:left';
    const tdStyle =
      'padding:7px 12px;border:1px solid #e2e8f0;color:#374151;vertical-align:top';
    const trEvenStyle = 'background:#f8faff';

    let out = '<div style="overflow-x:auto;margin:12px 0"><table style="' + tableStyle + '">';
    rows.forEach((row, i) => {
      const cells = row
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (i === 0) {
        out +=
          '<thead><tr>' +
          cells.map((c) => '<th style="' + thStyle + '">' + c + '</th>').join('') +
          '</tr></thead><tbody>';
      } else {
        const bg = i % 2 === 0 ? '' : ' style="' + trEvenStyle + '"';
        out +=
          '<tr' + bg + '>' +
          cells.map((c) => '<td style="' + tdStyle + '">' + c + '</td>').join('') +
          '</tr>';
      }
    });
    out += '</tbody></table></div>';
    return out;
  });

  // -- 10. Unordered lists ----------------------------------------------------
  html = html.replace(/((?:^- .+\n?)+)/gm, (block) => {
    const items = block
      .trim()
      .split('\n')
      .map((l) => l.replace(/^- /, '').trim());
    const liStyle =
      'display:flex;align-items:flex-start;gap:8px;margin:4px 0;color:#374151;font-size:13px';
    const dotStyle =
      'flex-shrink:0;width:6px;height:6px;border-radius:50%;background:#6366f1;margin-top:6px';
    return (
      '<ul style="margin:8px 0;padding:0;list-style:none">' +
      items
        .map(
          (item) =>
            '<li style="' +
            liStyle +
            '"><span style="' +
            dotStyle +
            '"></span><span>' +
            item +
            '</span></li>'
        )
        .join('') +
      '</ul>'
    );
  });

  // -- 11. Ordered lists ------------------------------------------------------
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
    const items = block
      .trim()
      .split('\n')
      .map((l) => l.replace(/^\d+\. /, '').trim());
    const liStyle =
      'display:flex;align-items:flex-start;gap:10px;margin:4px 0;color:#374151;font-size:13px';
    const numStyle =
      'flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#eef2ff;color:#4338ca;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:2px';
    return (
      '<ol style="margin:8px 0;padding:0;list-style:none">' +
      items
        .map(
          (item, idx) =>
            '<li style="' +
            liStyle +
            '"><span style="' +
            numStyle +
            '">' +
            (idx + 1) +
            '</span><span>' +
            item +
            '</span></li>'
        )
        .join('') +
      '</ol>'
    );
  });

  // -- 12. Paragraphs --------------------------------------------------------
  html = html.replace(
    /^(?!\s*<[a-zA-Z\/])(.+)$/gm,
    '<p style="margin:6px 0;color:#374151;line-height:1.7;font-size:13px">$1</p>'
  );

  // -- 13. Restore Math Placeholders -----------------------------------------
  mathPlaceholders.forEach((mathHtml, idx) => {
    html = html.replace(`___MATH_SLOT_${idx}___`, () => mathHtml);
  });

  // -- 14. Restore Code Placeholders -----------------------------------------
  codePlaceholders.forEach((codeHtml, idx) => {
    html = html.replace(`___CODE_SLOT_${idx}___`, () => codeHtml);
  });

  // -- 15. Restore Escaped Dollars -------------------------------------------
  html = html.replace(/___ESC_DOLLAR___/g, '$');

  return html;
}
