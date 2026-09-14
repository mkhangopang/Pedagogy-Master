/**
 * TABLE-AWARE SLO EXTRACTOR (v2.0 - Pure TypeScript & Node.js Engine)
 *
 * Handles Pakistan & international multi-grade progression grids
 * without relying on external python/pdfplumber binaries.
 * Uses pdfjs-dist coordinate-aware text item positioning to accurately
 * resolve horizontal tables and columns without cross-grade text blending.
 */

import * as pdfjs from 'pdfjs-dist';

// ── Domain / Competency mapping ───────────────────────────────────────────────
export const ENGLISH_COMPETENCY_DOMAIN: Record<string, string> = {
  '1': 'A',  // Reading and Critical Thinking Skills
  '2': 'B',  // Writing Skills
  '3': 'C',  // Oral Communication Skills
  '4': 'D',  // Vocabulary & Grammar
};

export const ENGLISH_DOMAIN_NAMES: Record<string, string> = {
  'A': 'Reading and Critical Thinking Skills',
  'B': 'Writing Skills',
  'C': 'Oral Communication Skills',
  'D': 'Vocabulary & Grammar',
};

export const MATH_DOMAIN_NAMES: Record<string, string> = {
  'A': 'Numbers and Operations',
  'B': 'Algebra',
  'C': 'Measurement and Geometry',
  'D': 'Information Handling',
};

export const SCIENCE_DOMAIN_NAMES: Record<string, string> = {
  'A': 'Life Science',
  'B': 'Physical Science',
  'C': 'Earth and Space Science',
};

export const SUBJECT_DOMAINS: Record<string, Record<string, string>> = {
  'E': ENGLISH_DOMAIN_NAMES,
  'M': MATH_DOMAIN_NAMES,
  'S': SCIENCE_DOMAIN_NAMES,
  'B': {
    'A': 'Cell Biology', 'B': 'Genetics', 'C': 'Evolution', 'D': 'Ecology',
    'E': 'Human Physiology', 'F': 'Plant Physiology', 'G': 'Microbiology', 'H': 'Biotechnology'
  },
  'C': {
    'A': 'Atomic Structure', 'B': 'Chemical Bonding', 'C': 'States of Matter',
    'D': 'Chemical Thermodynamics', 'E': 'Chemical Equilibrium', 'F': 'Acids, Bases and Salts',
    'G': 'Chemical Kinetics', 'H': 'Solutions', 'I': 'Electrochemistry',
    'J': 'S & p Block Elements', 'K': 'd & f Block Elements'
  },
  'P': {
    'A': 'Nature of Science', 'B': 'Measurement', 'C': 'Mechanics',
    'D': 'Heat & Thermodynamics', 'E': 'Waves', 'F': 'Electricity and Magnetism',
    'G': 'Digital Electronics', 'H': 'Modern Physics', 'I': 'Earth Space Science',
    'J': 'Medical Physics'
  }
};

export interface ExtractedSLORecord {
  slo_code: string;
  raw_slo_num: string;
  slo_full_text: string;
  grade_level: string;
  domain: string;
  domain_name: string;
  competency: string;
  subject: string;
  bloom_level: string | null;
  page: number;
}

const NON_SLO_PATTERNS = [
  /(?:committee|review\s+committee)\s+shall/i,
  /^(?:note:|s\.\s*no\.|ethical\s+and\s+social)/i,
  /(?:directorate|government\s+of\s+sindh|school\s+education)/i,
  /(?:textbook\s+(?:should|development|writing|evaluation))/i,
  /^\d+\s*\|\s*page/i,
  /(?:approaches|methods\s+and\s+strategies)/i,
  /(?:glossary|acknowledgement|minutes\s+of\s+meeting|preamble)/i,
  /^(?:apposition|appropriate|aspect|aside|authentic|autonomy):/i,
  /(?:bench\s*mark:|standard:)/i,
  /^table\s+of\s+contents/i,
  /^notification/i,
];

const BLOOM_VERBS: Record<string, string[]> = {
  Remember: [
    'identify', 'recognize', 'read', 'write', 'name', 'list', 'recall',
    'state', 'count', 'repeat', 'record', 'match', 'copy', 'trace'
  ],
  Understand: [
    'describe', 'explain', 'compare', 'contrast', 'distinguish', 'discuss',
    'interpret', 'express', 'comprehend', 'differentiate', 'classify', 'round'
  ],
  Apply: [
    'solve', 'calculate', 'apply', 'demonstrate', 'use', 'measure',
    'perform', 'add', 'subtract', 'multiply', 'divide', 'convert',
    'find', 'simplify', 'practice', 'produce', 'construct'
  ],
  Analyze: [
    'analyze', 'investigate', 'examine', 'categorize', 'infer', 'deduce',
    'differentiate', 'factor', 'expand', 'prove'
  ],
  Evaluate: [
    'evaluate', 'judge', 'assess', 'justify', 'verify', 'critique', 'select'
  ],
  Create: [
    'create', 'design', 'compose', 'formulate', 'develop', 'devise', 'synthesize'
  ]
};

export function detectBloomLevel(text: string): string {
  const lower = text.toLowerCase();
  for (const [level, verbs] of Object.entries(BLOOM_VERBS)) {
    for (const verb of verbs) {
      const reg = new RegExp(`\\b${verb}\\b`, 'i');
      if (reg.test(lower)) {
        return level;
      }
    }
  }
  return 'Apply';
}

function isNonSlo(text: string): boolean {
  if (!text || text.trim().length < 12) return true;
  const trimmed = text.trim();
  for (const pat of NON_SLO_PATTERNS) {
    if (pat.test(trimmed)) return true;
  }
  // Check if it has any educational action verb
  const lower = trimmed.toLowerCase();
  const allVerbs = Object.values(BLOOM_VERBS).flat();
  const hasVerb = allVerbs.some(v => lower.includes(v));
  return !hasVerb;
}

const GRADE_ALIASES: Record<string, string> = {
  'katchi': '00', 'k': '00', 'kg': '00', 'prep': '00', 'nursery': '00', 'ece': '00',
  'class i': '01', 'class 1': '01', 'grade i': '01', 'grade 1': '01',
  'class ii': '02', 'class 2': '02', 'grade ii': '02', 'grade 2': '02',
  'class iii': '03', 'class 3': '03', 'grade iii': '03', 'grade 3': '03',
  'class iv': '04', 'class 4': '04', 'grade iv': '04', 'grade 4': '04',
  'class v': '05', 'class 5': '05', 'grade v': '05', 'grade 5': '05',
  'class vi': '06', 'class 6': '06', 'grade vi': '06', 'grade 6': '06',
  'class vii': '07', 'class 7': '07', 'grade vii': '07', 'grade 7': '07',
  'class viii': '08', 'class 8': '08', 'grade viii': '08', 'grade 8': '08',
  'class ix': '09', 'class 9': '09', 'grade ix': '09', 'grade 9': '09',
  'class x': '10', 'class 10': '10', 'grade x': '10', 'grade 10': '10',
  'class xi': '11', 'class 11': '11', 'grade xi': '11', 'grade 11': '11',
  'class xii': '12', 'class 12': '12', 'grade xii': '12', 'grade 12': '12',
};

interface ColumnHeader {
  grade: string;
  xStart: number;
  xEnd: number;
  xCenter: number;
}

/**
 * Extract SLOs from a curriculum PDF buffer using coordinate-aware column detection.
 * Pure TypeScript execution without python dependencies.
 */
export async function extractSLOsFromPDFBuffer(
  pdfBuffer: Buffer,
  subjectCode: string = 'M'
): Promise<ExtractedSLORecord[]> {
  try {
    const domainNames = SUBJECT_DOMAINS[subjectCode] || MATH_DOMAIN_NAMES;
    const uint8Array = new Uint8Array(pdfBuffer);
    
    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
    });
    
    const pdf = await loadingTask.promise;
    const records: ExtractedSLORecord[] = [];
    const seenTexts = new Set<string>();

    let currentDomain = 'A';
    let currentDomainName = domainNames['A'] || 'General Domain';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = (textContent.items as any[]).filter(it => it.str && it.str.trim().length > 0);

      if (items.length === 0) continue;

      // Check for Domain headers on this page
      for (const it of items) {
        const dMatch = it.str.match(/DOMAIN\s+([A-Z])(?:\s*[:\-]\s*(.+))?/i);
        if (dMatch) {
          currentDomain = dMatch[1].toUpperCase();
          if (dMatch[2]?.trim()) {
            currentDomainName = dMatch[2].trim();
          } else if (domainNames[currentDomain]) {
            currentDomainName = domainNames[currentDomain];
          }
        }
      }

      // Detect Grade Column Headers across horizontal space
      // Find items that match grade header names
      const headerCandidates: { grade: string; x: number; width: number }[] = [];

      for (const it of items) {
        const lower = it.str.toLowerCase().trim();
        for (const [alias, grade] of Object.entries(GRADE_ALIASES)) {
          if (lower === alias || lower.startsWith(alias + ' ') || lower.endsWith(' ' + alias)) {
            const x = it.transform[4];
            const width = it.width || 60;
            headerCandidates.push({ grade, x, width });
            break;
          }
        }
      }

      // Sort unique columns by x
      headerCandidates.sort((a, b) => a.x - b.x);
      
      const columns: ColumnHeader[] = [];
      for (const hc of headerCandidates) {
        if (!columns.some(c => c.grade === hc.grade || Math.abs(c.xCenter - hc.x) < 40)) {
          columns.push({
            grade: hc.grade,
            xStart: hc.x - 30,
            xEnd: hc.x + hc.width + 30,
            xCenter: hc.x + hc.width / 2
          });
        }
      }

      // If page has horizontal columns (2 or more grade columns)
      if (columns.length >= 2) {
        // Adjust column bounds to span between neighbors
        for (let c = 0; c < columns.length; c++) {
          const prev = columns[c - 1];
          const next = columns[c + 1];
          const cur = columns[c];
          if (prev) cur.xStart = (prev.xCenter + cur.xCenter) / 2;
          if (next) cur.xEnd = (cur.xCenter + next.xCenter) / 2;
          else cur.xEnd = 1200; // Right margin bound
        }

        // Group items by column
        const columnItems: Record<string, any[]> = {};
        for (const col of columns) {
          columnItems[col.grade] = [];
        }

        for (const it of items) {
          const x = it.transform[4];
          const y = it.transform[5];
          // Find matching column
          for (const col of columns) {
            if (x >= col.xStart && x < col.xEnd) {
              columnItems[col.grade].push({ str: it.str, x, y });
              break;
            }
          }
        }

        // For each column, assemble text lines sorted by y descending
        for (const col of columns) {
          const cItems = columnItems[col.grade] || [];
          cItems.sort((a, b) => b.y - a.y); // top to bottom

          // Group into blocks
          let curBlock: string[] = [];
          let lastY = -1;

          for (const item of cItems) {
            if (lastY !== -1 && Math.abs(item.y - lastY) > 25) {
              // Flush block
              const blockText = curBlock.join(' ').replace(/\s+/g, ' ').trim();
              if (blockText.length > 15 && !isNonSlo(blockText)) {
                const normKey = blockText.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (!seenTexts.has(normKey)) {
                  seenTexts.add(normKey);
                  const bloom = detectBloomLevel(blockText);
                  const seq = records.filter(r => r.grade_level === col.grade && r.domain === currentDomain).length + 1;
                  const sloCode = `SLO:${subjectCode}-${col.grade}-${currentDomain}-${String(seq).padStart(2, '0')}`;
                  
                  // Check if original code exists in text
                  const codeMatch = blockText.match(/\b([A-Z]\d{2}[A-Z]\d{2})\b/);
                  const rawNum = codeMatch ? codeMatch[1] : `${currentDomain}.${seq}`;

                  records.push({
                    slo_code: sloCode,
                    raw_slo_num: rawNum,
                    slo_full_text: blockText,
                    grade_level: col.grade,
                    domain: currentDomain,
                    domain_name: currentDomainName,
                    competency: currentDomain,
                    subject: subjectCode === 'M' ? 'Mathematics' : subjectCode,
                    bloom_level: bloom,
                    page: pageNum
                  });
                }
              }
              curBlock = [];
            }
            curBlock.push(item.str);
            lastY = item.y;
          }

          if (curBlock.length > 0) {
            const blockText = curBlock.join(' ').replace(/\s+/g, ' ').trim();
            if (blockText.length > 15 && !isNonSlo(blockText)) {
              const normKey = blockText.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (!seenTexts.has(normKey)) {
                seenTexts.add(normKey);
                const bloom = detectBloomLevel(blockText);
                const seq = records.filter(r => r.grade_level === col.grade && r.domain === currentDomain).length + 1;
                const sloCode = `SLO:${subjectCode}-${col.grade}-${currentDomain}-${String(seq).padStart(2, '0')}`;
                const codeMatch = blockText.match(/\b([A-Z]\d{2}[A-Z]\d{2})\b/);
                const rawNum = codeMatch ? codeMatch[1] : `${currentDomain}.${seq}`;

                records.push({
                  slo_code: sloCode,
                  raw_slo_num: rawNum,
                  slo_full_text: blockText,
                  grade_level: col.grade,
                  domain: currentDomain,
                  domain_name: currentDomainName,
                  competency: currentDomain,
                  subject: subjectCode === 'M' ? 'Mathematics' : subjectCode,
                  bloom_level: bloom,
                  page: pageNum
                });
              }
            }
          }
        }
      }
    }

    console.log(`[TableExtractor] Extracted ${records.length} table-aligned SLOs without hallucination.`);
    return records;
  } catch (err: any) {
    console.warn('[TableExtractor] Pure TS table extraction encountered error:', err.message);
    return [];
  }
}

/**
 * Detect if a PDF is likely a multi-column SLO table document
 */
export function likelyHasMultiGradeTable(extractedText: string): boolean {
  const patterns = [
    /Class\s+(I{1,3}|IV|VI{0,3}|IX|X{0,3})\b/i,
    /Grade\s+(I{1,3}|IV|VI{0,3}|IX|X{0,3})\b/i,
    /Katchi/i,
    /Class\s+\d\s/i,
    /Grade\s+\d\s/i,
    /\bK-II\b|\bIII-V\b|\bVI-VIII\b/i,
    /\bI-VIII\b|\bIX-XII\b/i,
  ];
  let matches = 0;
  for (const p of patterns) {
    if (p.test(extractedText)) matches++;
  }
  return matches >= 2;
}
