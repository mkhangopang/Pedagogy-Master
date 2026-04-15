// lib/markdown-renderer.ts
// Pure markdown -> HTML converter - no external deps
// Handles: # headings, **bold**, *italic*, | tables |, - lists, 1. lists,
//          --- dividers, `inline code`, ```code blocks```
import katex from 'katex';

export function markdownToHtml(md: string): string {
  if (!md) return '';

  // -- 1. Escape HTML entities but preserve <br> ------------------------------
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/<br\s*\/?>/gi, '___BR_TAG___')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/___BR_TAG___/g, '<br/>');

  // -- 1.4 Handle Escaped Dollars (Literal $) ---------------------------------
  // Temporarily hide escaped dollars to avoid triggering math regex
  html = html.replace(/\\(\$)/g, '___ESC_DOLLAR___');

  // -- 1.5 Math Blocks ($$ ... $$ or \[ ... \]) -------------------------------
  const renderBlock = (_m: string, math: string) => {
    try {
      return `<div style="margin: 1.5rem 0; overflow-x: auto; text-align: center;">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch (e) {
      return `<div style="color: #f43f5e; font-family: monospace; font-size: 12px; margin: 12px 0;">[Math Error: ${math}]</div>`;
    }
  };
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, renderBlock);
  html = html.replace(/\\\[([\s\S]+?)\\\]/g, renderBlock);

  // -- 1.6 Inline Math ($ ... $ or \( ... \)) ---------------------------------
  const renderInline = (_m: string, math: string) => {
    const trimmed = math.trim();
    // Skip if it looks like money (e.g. $100, $10.50, $100%)
    if (/^\d+(\.\d+)?%?$/.test(trimmed)) return `$${trimmed}$`;
    try {
      return katex.renderToString(trimmed, { displayMode: false, throwOnError: false });
    } catch (e) {
      return `<span style="color: #f43f5e; font-family: monospace; font-size: 11px;">[Math Error: ${math}]</span>`;
    }
  };
  html = html.replace(/\$([^\$\n]+?)\$/g, renderInline);
  html = html.replace(/\\\(([\s\S]+?)\\\)/g, renderInline);

  // -- 1.7 Restore Escaped Dollars --------------------------------------------
  html = html.replace(/___ESC_DOLLAR___/g, '$');

  // -- 2. Code blocks (must come before inline code) -------------------------
  html = html.replace(
    /```[a-z]*\n?([\s\S]*?)```/g,
    (_m, code) =>
      '<pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:12px 0;overflow-x:auto;font-size:12px;font-family:monospace;white-space:pre-wrap;color:#334155">' +
      code +
      '</pre>'
  );

  // -- 3. Inline code ---------------------------------------------------------
  html = html.replace(
    /`([^`]+)`/g,
    (_m, code) =>
      '<code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px;font-family:monospace;color:#4338ca">' +
      code +
      '</code>'
  );

  // -- 4. Headings ------------------------------------------------------------
  html = html.replace(
    /^# (.+)$/gm,
    (_m, t) =>
      '<h1 style="font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:0.04em;color:#0f172a;margin:28px 0 12px;padding-bottom:8px;border-bottom:2px solid #4f46e5">' +
      t + '</h1>'
  );
  html = html.replace(
    /^## (.+)$/gm,
    (_m, t) =>
      '<h2 style="font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:0.03em;color:#1e293b;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0">' +
      t + '</h2>'
  );
  html = html.replace(
    /^### (.+)$/gm,
    (_m, t) =>
      '<h3 style="font-size:13px;font-weight:800;color:#4338ca;margin:16px 0 6px">' +
      t + '</h3>'
  );
  html = html.replace(
    /^#### (.+)$/gm,
    (_m, t) =>
      '<h4 style="font-size:12px;font-weight:700;color:#334155;margin:12px 0 4px">' +
      t + '</h4>'
  );

  // -- 5. Horizontal rules ----------------------------------------------------
  html = html.replace(
    /^---$/gm,
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>'
  );

  // -- 6. Bold + Italic -------------------------------------------------------
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="font-weight:800;color:#0f172a">$1</strong>'
  );
  html = html.replace(
    /\*([^*\n]+)\*/g,
    '<em style="font-style:italic;color:#475569">$1</em>'
  );

  // -- 7. Tables --------------------------------------------------------------
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

  // -- 8. Unordered lists -----------------------------------------------------
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

  // -- 9. Ordered lists -------------------------------------------------------
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

  // -- 10. Paragraphs ---------------------------------------------------------
  // Fix: Added check for leading whitespace and tags to avoid wrapping existing HTML elements
  html = html.replace(
    /^(?!\s*<[a-zA-Z\/])(.+)$/gm,
    '<p style="margin:6px 0;color:#374151;line-height:1.7;font-size:13px">$1</p>'
  );

  return html;
}
