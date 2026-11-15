'use client';

import { marked, Token, Tokens } from 'marked';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from 'docx';
import { markdownToHtml } from '../markdown-renderer';

export type ArtifactLanguage = 'en' | 'ur' | 'sd';

export interface ArtifactExportOptions {
  markdown: string;
  toolName: string;
  documentName?: string;
  userName?: string;
  language: ArtifactLanguage;
}

const LANGUAGE_LABELS: Record<ArtifactLanguage, string> = {
  en: 'English',
  ur: 'Urdu (اردو)',
  sd: 'Sindhi (سنڌي)',
};

function sanitizeFilename(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'pedagogy-artifact'
  );
}

function getExportFont(language: ArtifactLanguage): string {
  if (language === 'ur') return 'Noto Nastaliq Urdu';
  if (language === 'sd') return 'Noto Naskh Arabic';
  return 'Calibri';
}

function hasArabicScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

function buildInlineRuns(
  tokens: Token[] | undefined,
  language: ArtifactLanguage,
  options: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}
): TextRun[] {
  if (!tokens || tokens.length === 0) return [];
  const isRtl = language !== 'en';
  const rtlFont = getExportFont(language);
  const runs: TextRun[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'strong': {
        const strongToken = token as Tokens.Strong;
        runs.push(
          ...buildInlineRuns(strongToken.tokens, language, {
            ...options,
            bold: true,
          })
        );
        break;
      }
      case 'em': {
        const emToken = token as Tokens.Em;
        runs.push(
          ...buildInlineRuns(emToken.tokens, language, {
            ...options,
            italics: true,
          })
        );
        break;
      }
      case 'codespan': {
        const codeToken = token as Tokens.Codespan;
        runs.push(
          new TextRun({
            text: codeToken.text,
            font: 'Consolas',
            size: options.size ?? 20,
            color: '4338CA',
            rightToLeft: false,
            bold: options.bold,
          })
        );
        break;
      }
      case 'link': {
        const linkToken = token as Tokens.Link;
        runs.push(
          ...buildInlineRuns(linkToken.tokens, language, {
            ...options,
            color: '4F46E5',
          })
        );
        break;
      }
      case 'del': {
        const delToken = token as Tokens.Del;
        runs.push(
          ...buildInlineRuns(delToken.tokens, language, options)
        );
        break;
      }
      case 'br': {
        runs.push(new TextRun({ break: 1 }));
        break;
      }
      case 'text': {
        const textToken = token as Tokens.Text;
        if (textToken.tokens && textToken.tokens.length > 0) {
          runs.push(...buildInlineRuns(textToken.tokens, language, options));
        } else {
          const val = textToken.text || '';
          const runIsRtl = isRtl && hasArabicScript(val);
          runs.push(
            new TextRun({
              text: val,
              bold: options.bold,
              italics: options.italics,
              color: options.color ?? '1E293B',
              size: options.size ?? 22,
              font: runIsRtl ? rtlFont : 'Calibri',
              rightToLeft: runIsRtl,
            })
          );
        }
        break;
      }
      case 'escape': {
        const escToken = token as Tokens.Escape;
        runs.push(
          new TextRun({
            text: escToken.text,
            bold: options.bold,
            italics: options.italics,
            color: options.color ?? '1E293B',
            size: options.size ?? 22,
            font: isRtl ? rtlFont : 'Calibri',
            rightToLeft: isRtl && hasArabicScript(escToken.text),
          })
        );
        break;
      }
      default: {
        const raw = (token as any).text || (token as any).raw || '';
        if (raw) {
          const runIsRtl = isRtl && hasArabicScript(raw);
          runs.push(
            new TextRun({
              text: raw,
              bold: options.bold,
              italics: options.italics,
              color: options.color ?? '1E293B',
              size: options.size ?? 22,
              font: runIsRtl ? rtlFont : 'Calibri',
              rightToLeft: runIsRtl,
            })
          );
        }
      }
    }
  }

  return runs;
}

function tokensToDocxBlocks(
  tokens: Token[],
  language: ArtifactLanguage
): Array<Paragraph | Table> {
  const isRtl = language !== 'en';
  const alignment = isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const blocks: Array<Paragraph | Table> = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        break;

      case 'heading': {
        const h = token as Tokens.Heading;
        const headingLevels: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4,
        };
        const sizes: Record<number, number> = { 1: 32, 2: 26, 3: 24, 4: 22 };
        const color = h.depth === 3 ? '4338CA' : '0F172A';
        blocks.push(
          new Paragraph({
            heading: headingLevels[h.depth] ?? HeadingLevel.HEADING_4,
            bidirectional: isRtl,
            alignment,
            spacing: { before: h.depth === 1 ? 260 : 180, after: 100 },
            border:
              h.depth <= 2
                ? {
                    bottom: {
                      color: h.depth === 1 ? '4F46E5' : 'E2E8F0',
                      size: h.depth === 1 ? 12 : 6,
                      style: BorderStyle.SINGLE,
                    },
                  }
                : undefined,
            children: buildInlineRuns(h.tokens, language, {
              bold: true,
              color,
              size: sizes[h.depth] ?? 22,
            }),
          })
        );
        break;
      }

      case 'paragraph': {
        const p = token as Tokens.Paragraph;
        blocks.push(
          new Paragraph({
            bidirectional: isRtl,
            alignment,
            spacing: { before: 60, after: 100, line: isRtl ? 340 : 280 },
            children: buildInlineRuns(p.tokens, language),
          })
        );
        break;
      }

      case 'blockquote': {
        const bq = token as Tokens.Blockquote;
        const innerText = bq.text || '';
        const runs = bq.tokens
          ? bq.tokens.flatMap((inner) =>
              'tokens' in inner && Array.isArray((inner as any).tokens)
                ? buildInlineRuns((inner as any).tokens, language, {
                    italics: true,
                    color: '334155',
                  })
                : [
                    new TextRun({
                      text: innerText,
                      italics: true,
                      color: '334155',
                      font: isRtl ? getExportFont(language) : 'Calibri',
                      rightToLeft: isRtl,
                    }),
                  ]
            )
          : [
              new TextRun({
                text: innerText,
                italics: true,
                color: '334155',
                font: isRtl ? getExportFont(language) : 'Calibri',
                rightToLeft: isRtl,
              }),
            ];

        blocks.push(
          new Paragraph({
            bidirectional: isRtl,
            alignment,
            indent: isRtl
              ? { right: convertInchesToTwip(0.25) }
              : { left: convertInchesToTwip(0.25) },
            spacing: { before: 100, after: 100, line: isRtl ? 340 : 280 },
            shading: { type: ShadingType.CLEAR, fill: 'F8FAFF' },
            border: isRtl
              ? {
                  right: {
                    color: '6366F1',
                    size: 18,
                    style: BorderStyle.SINGLE,
                  },
                }
              : {
                  left: {
                    color: '6366F1',
                    size: 18,
                    style: BorderStyle.SINGLE,
                  },
                },
            children: runs,
          })
        );
        break;
      }

      case 'list': {
        const list = token as Tokens.List;
        list.items.forEach((item, idx) => {
          const itemTokens = item.tokens || [];
          const inlineTokens: Token[] = [];
          for (const sub of itemTokens) {
            if (sub.type === 'text' || sub.type === 'paragraph') {
              const subTokens = (sub as any).tokens;
              if (Array.isArray(subTokens)) {
                inlineTokens.push(...subTokens);
              } else if ((sub as any).text) {
                inlineTokens.push({
                  type: 'text',
                  raw: (sub as any).text,
                  text: (sub as any).text,
                } as Tokens.Text);
              }
            }
          }

          const marker = list.ordered ? `${idx + 1}. ` : '• ';
          blocks.push(
            new Paragraph({
              bidirectional: isRtl,
              alignment,
              indent: isRtl
                ? { right: convertInchesToTwip(0.3), hanging: convertInchesToTwip(0.15) }
                : { left: convertInchesToTwip(0.3), hanging: convertInchesToTwip(0.15) },
              spacing: { before: 40, after: 60, line: isRtl ? 340 : 280 },
              children: [
                new TextRun({
                  text: marker,
                  bold: true,
                  color: '4F46E5',
                  size: 22,
                  rightToLeft: isRtl,
                }),
                ...buildInlineRuns(
                  inlineTokens.length > 0
                    ? inlineTokens
                    : [{ type: 'text', raw: item.text, text: item.text } as Tokens.Text],
                  language
                ),
              ],
            })
          );
        });
        break;
      }

      case 'table': {
        const tbl = token as Tokens.Table;
        const colCount = Math.max(tbl.header.length, 1);
        const colWidthPct = Math.floor(100 / colCount);
        const tableRows: TableRow[] = [];

        const headerCells = (isRtl ? [...tbl.header].reverse() : tbl.header).map(
          (cell) =>
            new TableCell({
              width: { size: colWidthPct, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: 'EEF2FF' },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: [
                new Paragraph({
                  bidirectional: isRtl,
                  alignment,
                  children: buildInlineRuns(cell.tokens, language, {
                    bold: true,
                    color: '3730A3',
                    size: 20,
                  }),
                }),
              ],
            })
        );
        tableRows.push(new TableRow({ tableHeader: true, children: headerCells }));

        tbl.rows.forEach((row, rIdx) => {
          const orderedRow = isRtl ? [...row].reverse() : row;
          const cells = orderedRow.map(
            (cell) =>
              new TableCell({
                width: { size: colWidthPct, type: WidthType.PERCENTAGE },
                shading:
                  rIdx % 2 === 1
                    ? { type: ShadingType.CLEAR, fill: 'F8FAFF' }
                    : undefined,
                margins: { top: 90, bottom: 90, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    bidirectional: isRtl,
                    alignment,
                    children: buildInlineRuns(cell.tokens, language, {
                      size: 20,
                      color: '374151',
                    }),
                  }),
                ],
              })
          );
          tableRows.push(new TableRow({ children: cells }));
        });

        blocks.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            visuallyRightToLeft: isRtl,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
              insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
            },
            rows: tableRows,
          })
        );
        blocks.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }));
        break;
      }

      case 'code': {
        const codeToken = token as Tokens.Code;
        blocks.push(
          new Paragraph({
            bidirectional: false,
            alignment: AlignmentType.LEFT,
            shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
            spacing: { before: 100, after: 100 },
            children: [
              new TextRun({
                text: codeToken.text,
                font: 'Consolas',
                size: 18,
                color: '334155',
              }),
            ],
          })
        );
        break;
      }

      case 'hr': {
        blocks.push(
          new Paragraph({
            spacing: { before: 120, after: 120 },
            border: {
              bottom: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
            },
            children: [],
          })
        );
        break;
      }

      default: {
        const rawText = (token as any).text || (token as any).raw || '';
        if (rawText.trim()) {
          blocks.push(
            new Paragraph({
              bidirectional: isRtl,
              alignment,
              spacing: { before: 60, after: 80 },
              children: [
                new TextRun({
                  text: rawText.trim(),
                  font: isRtl ? getExportFont(language) : 'Calibri',
                  size: 22,
                  rightToLeft: isRtl,
                }),
              ],
            })
          );
        }
      }
    }
  }

  return blocks;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 500);
}

export async function exportArtifactAsDocx(
  options: ArtifactExportOptions
): Promise<void> {
  const { markdown, toolName, documentName, userName, language } = options;
  const tokens = marked.lexer(markdown);
  const contentBlocks = tokensToDocxBlocks(tokens, language);

  const metaLine = [
    toolName,
    documentName || 'General Mode',
    LANGUAGE_LABELS[language],
    userName ? `Educator: ${userName}` : '',
  ]
    .filter(Boolean)
    .join('  •  ');

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.85),
              bottom: convertInchesToTwip(0.85),
              left: convertInchesToTwip(0.85),
              right: convertInchesToTwip(0.85),
            },
          },
        },
        children: [
          new Paragraph({
            bidirectional: false,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: 'PEDAGOGY MASTER AI',
                bold: true,
                size: 28,
                color: '1E3A5F',
                font: 'Calibri',
              }),
            ],
          }),
          new Paragraph({
            bidirectional: false,
            spacing: { after: 200 },
            border: {
              bottom: { color: '4F46E5', size: 14, style: BorderStyle.SINGLE },
            },
            children: [
              new TextRun({
                text: metaLine,
                size: 18,
                color: '64748B',
                font: 'Calibri',
              }),
            ],
          }),
          ...contentBlocks,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${sanitizeFilename(toolName)}-${language}.docx`;
  triggerBlobDownload(blob, filename);
}

export async function exportArtifactAsPdf(
  options: ArtifactExportOptions
): Promise<void> {
  const { markdown, toolName, documentName, userName, language } = options;
  const isRtl = language !== 'en';

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const container = document.createElement('div');
  const fontClass =
    language === 'ur' ? 'font-urdu' : language === 'sd' ? 'font-sindhi' : '';
  const containerWidthPx = 794;

  container.style.position = 'fixed';
  container.style.left = '-12000px';
  container.style.top = '0';
  container.style.width = `${containerWidthPx}px`;
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.padding = '44px 48px';
  container.style.boxSizing = 'border-box';
  container.style.zIndex = '-1';
  if (fontClass) container.className = fontClass;

  const metaLeft = `${toolName} • ${documentName || 'General Mode'} • ${LANGUAGE_LABELS[language]}`;
  const metaRight = `${userName || 'Educator'} • ${new Date().toLocaleDateString()}`;

  const bodyHtml = markdownToHtml(markdown, isRtl ? 'rtl' : 'ltr');

  container.innerHTML = `
    <div style="border-bottom:2px solid #4f46e5;padding-bottom:14px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:flex-end;font-family:'Plus Jakarta Sans',Arial,sans-serif;" dir="ltr">
      <div>
        <div style="font-size:18px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#1e3a5f;">Pedagogy Master AI</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px;">${metaLeft}</div>
      </div>
      <div style="font-size:10px;color:#64748b;text-align:right;">
        <div>${metaRight}</div>
      </div>
    </div>
    <div id="pm-pdf-body" dir="${isRtl ? 'rtl' : 'ltr'}" class="${fontClass}" style="text-align:${isRtl ? 'right' : 'left'};">${bodyHtml}</div>
  `;

  document.body.appendChild(container);

  try {
    const containerRect = container.getBoundingClientRect();
    const breakCandidates = new Set<number>();
    const elements = container.querySelectorAll(
      '#pm-pdf-body > h1, #pm-pdf-body > h2, #pm-pdf-body > h3, #pm-pdf-body > h4, #pm-pdf-body > p, #pm-pdf-body > blockquote, #pm-pdf-body > ul > li, #pm-pdf-body > ol > li, #pm-pdf-body table tr, #pm-pdf-body > hr, #pm-pdf-body > pre'
    );
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      breakCandidates.add(Math.round(rect.bottom - containerRect.top));
    });
    const sortedBreaks = Array.from(breakCandidates).sort((a, b) => a - b);

    const scale = 2;
    const canvas = await html2canvas(container, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: containerWidthPx,
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidthMm = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();
    const marginXMm = 8;
    const marginTopMm = 8;
    const marginBottomMm = 12;
    const printableWidthMm = pageWidthMm - marginXMm * 2;
    const printableHeightMm = pageHeightMm - marginTopMm - marginBottomMm;

    const pxPerMm = canvas.width / printableWidthMm;
    const maxSliceHeightPx = Math.floor(printableHeightMm * pxPerMm);

    const slices: Array<{ startPx: number; endPx: number }> = [];
    let currentStart = 0;

    while (currentStart < canvas.height) {
      const idealEnd = Math.min(currentStart + maxSliceHeightPx, canvas.height);
      if (idealEnd >= canvas.height) {
        slices.push({ startPx: currentStart, endPx: canvas.height });
        break;
      }

      const minAcceptablePx = currentStart + Math.floor(maxSliceHeightPx * 0.55);
      let snappedEnd = idealEnd;
      for (let i = sortedBreaks.length - 1; i >= 0; i--) {
        const candidatePx = sortedBreaks[i] * scale;
        if (candidatePx <= idealEnd && candidatePx >= minAcceptablePx) {
          snappedEnd = candidatePx;
          break;
        }
      }

      slices.push({ startPx: currentStart, endPx: snappedEnd });
      currentStart = snappedEnd;
    }

    const totalPages = slices.length;
    slices.forEach((slice, idx) => {
      if (idx > 0) pdf.addPage();
      const sliceHeightPx = slice.endPx - slice.startPx;
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      const ctx = sliceCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          slice.startPx,
          canvas.width,
          sliceHeightPx,
          0,
          0,
          canvas.width,
          sliceHeightPx
        );
      }

      const sliceHeightMm = sliceHeightPx / pxPerMm;
      const imgData = sliceCanvas.toDataURL('image/png');
      pdf.addImage(
        imgData,
        'PNG',
        marginXMm,
        marginTopMm,
        printableWidthMm,
        sliceHeightMm,
        undefined,
        'FAST'
      );

      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text(
        `Pedagogy Master AI  •  Page ${idx + 1} of ${totalPages}`,
        pageWidthMm / 2,
        pageHeightMm - 5,
        { align: 'center' }
      );
    });

    const filename = `${sanitizeFilename(toolName)}-${language}.pdf`;
    pdf.save(filename);
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}
