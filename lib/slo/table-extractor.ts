/**
 * TABLE-AWARE SLO EXTRACTOR (v1.0)
 *
 * PROBLEM SOLVED:
 * Pakistan curriculum PDFs (Sindh, Federal, FBISE, Punjab) store SLOs in
 * horizontal tables where each column is a different grade:
 *
 *   | S.No. | Katchi (K) | Class I    | Class II   |
 *   |-------|------------|------------|------------|
 *   | 1.1.1 | SLO text K | SLO text 1 | SLO text 2 |
 *
 * The previous pdf-parse approach read text linearly (left-to-right, top-to-bottom),
 * completely losing the column-to-grade relationship. This caused:
 *   - Katchi (K) SLOs assigned to Grade 7
 *   - All 3 grade texts merged into one "SLO"
 *   - Administrative/glossary text mistaken for SLOs
 *
 * THIS MODULE:
 * - Uses Python pdfplumber (table detection) via a server-side Python script
 * - Each SLO is correctly assigned to its grade column
 * - Filters out glossary entries, administrative text, benchmarks-as-SLOs
 * - Produces canonical codes: E[GG][Domain][NN] with logical ordering
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

const execFileAsync = promisify(execFile);

// ── Domain / Competency mapping ───────────────────────────────────────────────
// Canonical for ALL Sindh/Federal Board English curricula (NCP 2022-23 aligned)
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

// ── The Python extraction script ───────────────────────────────────────────────
const PYTHON_EXTRACTOR = `
import sys
import json
import re
import pdfplumber

pdf_path = sys.argv[1]

GRADE_GROUPS = {
    "Katchi (K)": "K", "Katchi": "K", "KG": "K",
    "Class I": "01", "Class 1": "01",
    "Class II": "02", "Class 2": "02",
    "Class III": "03", "Class 3": "03",
    "Class IV": "04", "Class 4": "04",
    "Class V": "05", "Class 5": "05",
    "Class VI": "06", "Class 6": "06",
    "Class VII": "07", "Class 7": "07",
    "Class VIII": "08", "Class 8": "08",
    "Class IX": "09", "Class 9": "09",
    "Class X": "10", "Class 10": "10",
    "Class XI": "11", "Class 11": "11",
    "Class XII": "12", "Class 12": "12",
}

COMPETENCY_DOMAIN = {
    "1": "A", "2": "B", "3": "C", "4": "D"
}

DOMAIN_NAMES = {
    "A": "Reading and Critical Thinking Skills",
    "B": "Writing Skills",
    "C": "Oral Communication Skills",
    "D": "Vocabulary & Grammar",
}

# Text patterns that indicate NON-SLO content
NON_SLO_PATTERNS = [
    r"(committee|review committee)\\s+shall",
    r"^(note:|s\\.\\s*no\\.|ethical and social)",
    r"(directorate|government of sindh|school education)",
    r"(textbook\\s+(should|development|writing|evaluation))",
    r"^\\d+\\s*\\|\\s*[Pp]\\s*a\\s*g\\s*e",
    r"(approaches|methods and strategies)",
    r"(glossary|acknowledgement|minutes of meeting|preamble)",
    r"^\\[",
    r"^(apposition|appropriate|aspect|aside|authentic|autonomy):",
    r"(bench\\s*mark:|standard:)",
]

def is_non_slo(text):
    if not text or len(text.strip()) < 12:
        return True
    t = text.lower().strip()
    # Glossary entries start with a term followed by colon
    if re.match(r'^[a-z][a-z\\s]{2,30}:\\s+[A-Z]', text):
        return True
    # Benchmark rows that describe what a benchmark IS (not an SLO)
    if t.startswith("benchmark:"):
        return True
    for pat in NON_SLO_PATTERNS:
        if re.search(pat, t, re.IGNORECASE):
            return True
    # Must-have: real SLOs have an action verb from Bloom's taxonomy
    bloom_verbs = ['identify', 'recognize', 'read', 'write', 'use', 'demonstrate',
                   'apply', 'analyze', 'evaluate', 'create', 'describe', 'explain',
                   'express', 'develop', 'articulate', 'comprehend', 'locate',
                   'compare', 'contrast', 'predict', 'summarize', 'retell', 'recite',
                   'match', 'listen', 'speak', 'compose', 'revise', 'edit', 'construct',
                   'infer', 'deduce', 'guess', 'find', 'select', 'choose', 'arrange',
                   'trace', 'copy', 'fill', 'hold', 'enjoy', 'repeat', 'show', 'talk',
                   'share', 'take', 'produce', 'respond', 'practice', 'participate',
                   'pronounce', 'name', 'distinguish', 'interpret', 'transform', 'change']
    has_verb = any(v in t for v in bloom_verbs)
    return not has_verb

def detect_competency(text):
    text = text.lower()
    if re.search(r'competency\\s+1|reading.*critical|critical.*reading', text):
        return "1"
    if re.search(r'competency\\s+2|writing\\s+skills', text):
        return "2"
    if re.search(r'competency\\s+3|oral.*communication', text):
        return "3"
    if re.search(r'competency\\s+4|vocabulary.*grammar|grammar.*vocabulary', text):
        return "4"
    return None

def extract_slo_number(cell):
    if not cell:
        return None
    m = re.search(r'(\\d+\\.\\d+\\.\\d+)', str(cell))
    return m.group(1) if m else None

def slo_number_to_seq(slo_num):
    parts = slo_num.split('.')
    if len(parts) == 3:
        return int(parts[2])
    return 0

def clean_text(t):
    if not t:
        return ''
    return re.sub(r'\\s+', ' ', str(t)).strip()

all_slos = []
seen = {}
current_competency = "1"

with pdfplumber.open(pdf_path) as pdf:
    for page_num, page in enumerate(pdf.pages):
        page_text = page.extract_text() or ""
        
        # Update competency from page header
        comp = detect_competency(page_text[:600])
        if comp:
            current_competency = comp
        
        # Stop at glossary/appendix sections (avoid contamination)
        if re.search(r'^\\s*(Glossary|Acknowledgement|Minutes of meeting)\\s*$', page_text, re.MULTILINE):
            break
        
        tables = page.extract_tables()
        for table in tables:
            if not table or len(table) < 2:
                continue
            
            # Find grade columns in header row
            header = table[0]
            grade_cols = {}
            for col_idx, cell in enumerate(header or []):
                cell_str = clean_text(cell)
                for grade_key, grade_val in GRADE_GROUPS.items():
                    if grade_key.lower() in cell_str.lower():
                        grade_cols[col_idx] = grade_val
                        break
            
            if not grade_cols:
                continue
            
            # Process data rows
            for row in table[1:]:
                if not row:
                    continue
                
                # Update competency from row content
                for cell in row:
                    comp = detect_competency(str(cell or ""))
                    if comp:
                        current_competency = comp
                
                slo_num = extract_slo_number(row[0])
                if not slo_num:
                    continue
                
                comp_num = slo_num.split('.')[0]
                domain = COMPETENCY_DOMAIN.get(comp_num, COMPETENCY_DOMAIN.get(current_competency, "A"))
                seq = slo_number_to_seq(slo_num)
                
                for col_idx, grade in grade_cols.items():
                    if col_idx >= len(row):
                        continue
                    
                    cell_text = clean_text(row[col_idx])
                    
                    if not cell_text or cell_text in ('---', '-', 'None'):
                        continue
                    
                    if is_non_slo(cell_text):
                        continue
                    
                    grade_str = grade.zfill(2) if grade != 'K' else 'K'
                    code = f"E{grade_str}{domain}{str(seq).zfill(2)}"
                    
                    # Deduplicate by code
                    if code in seen:
                        seen[code] += 1
                        code = f"{code}v{seen[code]}"
                    else:
                        seen[code] = 1
                    
                    all_slos.append({
                        "slo_code": code,
                        "raw_slo_num": slo_num,
                        "slo_full_text": cell_text,
                        "grade_level": grade,
                        "domain": domain,
                        "domain_name": DOMAIN_NAMES.get(domain, ""),
                        "competency": comp_num,
                        "subject": "English",
                        "bloom_level": None,
                        "page": page_num + 1
                    })

# Sort: grade → competency → sequence number
GRADE_ORDER = {'K': 0, '01': 1, '02': 2, '03': 3, '04': 4, '05': 5,
               '06': 6, '07': 7, '08': 8, '09': 9, '10': 10, '11': 11, '12': 12}

def sort_key(s):
    g = GRADE_ORDER.get(s['grade_level'], 99)
    c = int(s.get('competency') or 1)
    parts = s.get('raw_slo_num', '0.0.0').split('.')
    n = int(parts[2]) if len(parts) == 3 else 0
    return (g, c, n)

all_slos.sort(key=sort_key)
print(json.dumps(all_slos))
`;

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

/**
 * Extract SLOs from a curriculum PDF buffer using table-aware detection.
 * Falls back to the legacy regex path if Python/pdfplumber is unavailable.
 */
export async function extractSLOsFromPDFBuffer(
  pdfBuffer: Buffer,
  subjectCode: string
): Promise<ExtractedSLORecord[]> {
  // Write buffer to temp file
  const tmpFile = join(tmpdir(), `pm_extract_${createHash('md5').update(pdfBuffer).digest('hex').slice(0, 8)}.pdf`);
  const scriptFile = join(tmpdir(), `pm_extractor_${Date.now()}.py`);

  try {
    writeFileSync(tmpFile, pdfBuffer);
    writeFileSync(scriptFile, PYTHON_EXTRACTOR);

    const { stdout, stderr } = await execFileAsync('python3', [scriptFile, tmpFile], {
      timeout: 120000, // 2 minutes
      maxBuffer: 10 * 1024 * 1024, // 10MB output
    });

    if (stderr && stderr.length > 0) {
      console.warn('[TableExtractor] Python warnings:', stderr.slice(0, 500));
    }

    const records: ExtractedSLORecord[] = JSON.parse(stdout);
    console.log(`[TableExtractor] Successfully extracted ${records.length} SLOs using table detection`);
    return records;

  } catch (err: any) {
    console.error('[TableExtractor] Python extraction failed:', err.message);
    // Return empty — caller falls back to legacy regex path
    return [];
  } finally {
    try { unlinkSync(tmpFile); } catch (_) {}
    try { unlinkSync(scriptFile); } catch (_) {}
  }
}

/**
 * Detect if a PDF is likely a multi-column SLO table document
 * (as opposed to a flat-text curriculum that works fine with regex).
 * Checks for the column header patterns: "Class I", "Class II", "Katchi", etc.
 */
export function likelyHasMultiGradeTable(extractedText: string): boolean {
  const patterns = [
    /Class\s+(I{1,3}|IV|VI{0,3}|IX|X{0,3})\b/i,
    /Katchi/i,
    /Class\s+\d\s/i,
    /\bK-II\b|\bIII-V\b|\bVI-VIII\b/i,
  ];
  let matches = 0;
  for (const p of patterns) {
    if (p.test(extractedText)) matches++;
  }
  return matches >= 2;
}
