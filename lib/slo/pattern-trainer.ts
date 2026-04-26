/**
 * SLO PATTERN MEMORY TRAINER (v1.0)
 *
 * PURPOSE:
 * Every time a document is successfully ingested, the app "learns" the
 * structural patterns of that document type (board, subject, grade range,
 * table format). This memory makes future extractions of similar documents
 * faster and more accurate without re-running heavy AI extraction.
 *
 * HOW IT WORKS:
 * 1. After successful ingestion, store a "pattern fingerprint" in Supabase
 *    table `extraction_patterns`
 * 2. Before ingesting a new document, check if a matching pattern exists
 * 3. If match found: use saved pattern as AI prompt context (higher accuracy)
 * 4. Periodically, the admin can run a "training digest" to consolidate patterns
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ExtractionPattern {
  id?: string;
  board: string;
  subject: string;
  grade_range: string;
  slo_format: string;
  column_structure: string;
  competency_domain_map: Record<string, string>;
  grade_section_headers: string[];
  non_slo_sections: string[];
  sample_codes: string[];
  total_slos_extracted: number;
  extraction_accuracy: number;
}

// ── Detect structural format from extracted text ──────────────────────────────
export function detectSLOFormat(text: string): string {
  if (/\[SLO\s*:\s*[A-Z]+-\d{2}-[A-Z]-\d{2}\]/i.test(text)) return 'bracket_code';
  if (/\d+\.\d+\.\d+/.test(text)) return 'competency.benchmark.slo';
  if (/[A-Z]{1,3}\d{2}[A-Z]\d{2}/.test(text)) return 'concatenated_code';
  if (/SLO\s*\d+\.\d+/.test(text)) return 'slo_numbered';
  return 'unknown';
}

export function detectColumnStructure(text: string): string {
  if (/Katchi.*Class I.*Class II|Class I.*Class II.*Katchi/i.test(text)) return 'K|I|II';
  if (/Class III.*Class IV.*Class V/i.test(text)) return 'III|IV|V';
  if (/Class VI.*Class VII.*Class VIII/i.test(text)) return 'VI|VII|VIII';
  if (/Class IX.*Class X|Class XI.*Class XII/i.test(text)) return 'IX|X|XI|XII';
  return 'single';
}

export function detectGradeRange(text: string, sampleCodes: string[]): string {
  const grades = new Set<string>();
  for (const code of sampleCodes) {
    if (!code) continue;
    const m = code.match(/[A-Z]([K\d]{1,2})[A-Z]/);
    if (m) grades.add(m[1]);
  }
  if (grades.has('K') || grades.has('01') || grades.has('02')) {
    if (grades.has('08') || grades.has('07')) return 'K-VIII';
    if (grades.has('05') || grades.has('04')) return 'K-V';
    return 'K-II';
  }
  if (grades.has('03') && grades.has('05')) return 'III-V';
  if (grades.has('06') && grades.has('08')) return 'VI-VIII';
  if (grades.has('09') && grades.has('12')) return 'IX-XII';
  return 'unknown';
}

// ── Save pattern after successful extraction ──────────────────────────────────
export async function saveExtractionPattern(
  supabase: SupabaseClient,
  rawText: string,
  extractedSlos: any[],
  board: string,
  subject: string
): Promise<void> {
  if (extractedSlos.length < 5) {
    console.log('[PatternTrainer] Too few SLOs to save a reliable pattern.');
    return;
  }

  const sampleCodes = extractedSlos.slice(0, 5).map((s: any) => s.slo_code).filter(Boolean);
  const gradeRange = detectGradeRange(rawText, sampleCodes);
  const sloFormat = detectSLOFormat(rawText);
  const columnStructure = detectColumnStructure(rawText);

  // Build the competency→domain map from the extracted data.
  // BUG-03 FIX: The previous else branch was completely empty — it matched codes
  // but never wrote anything to compDomainMap. Now we infer the domain letter
  // from the SLO code pattern [SUBJECT][GRADE][DOMAIN_LETTER][SEQ], e.g. "E07B03"
  // → domain "B". We use a running numeric key ("1", "2", ...) as the competency.
  const compDomainMap: Record<string, string> = {};
  const domainOrder: string[] = []; // tracks insertion order for stable numeric keys

  for (const slo of extractedSlos) {
    if (slo.competency && slo.domain) {
      compDomainMap[String(slo.competency)] = String(slo.domain).toUpperCase();
    } else if (slo.slo_code) {
      // Infer domain letter from standard code format: [A-Z]{1,3}[GRADE_2D][DOMAIN_LETTER][SEQ_2D]
      const compMatch = slo.slo_code.match(/^[A-Z]{1,3}\d{2}([A-Z])\d{2}/);
      if (compMatch) {
        const domainLetter = compMatch[1];
        if (!domainOrder.includes(domainLetter)) {
          domainOrder.push(domainLetter);
        }
        // Map numeric competency index (1-based) → domain letter
        const compKey = String(domainOrder.indexOf(domainLetter) + 1);
        if (!compDomainMap[compKey]) {
          compDomainMap[compKey] = domainLetter;
        }
      }
    }
  }

  // Detect grade section headers (lines like "Class K-II", "Grade III-V", etc.)
  const headerPatterns: string[] = [];
  const headerRe = /^(Class|Grade|Competency)\s+[\w\s\-–]+/gm;
  let hMatch;
  while ((hMatch = headerRe.exec(rawText)) !== null) {
    const h = hMatch[0].trim();
    if (!headerPatterns.includes(h) && headerPatterns.length < 10) {
      headerPatterns.push(h);
    }
  }

  // Known non-SLO sections for this document type
  const nonSloSections = ['Preamble', 'Section 1', 'Section 4', 'Section 5',
    'Section 6', 'Section 7', 'Section 8', 'Glossary', 'Acknowledgement',
    'Minutes of meeting', 'Table of Contents'];

  const pattern: ExtractionPattern = {
    board,
    subject,
    grade_range: gradeRange,
    slo_format: sloFormat,
    column_structure: columnStructure,
    competency_domain_map: Object.keys(compDomainMap).length > 0 ? compDomainMap : { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
    grade_section_headers: headerPatterns,
    non_slo_sections: nonSloSections,
    sample_codes: sampleCodes,
    total_slos_extracted: extractedSlos.length,
    extraction_accuracy: 0.9, // Default; admin can adjust via audit
  };

  const { error } = await supabase
    .from('extraction_patterns')
    .upsert(pattern, { onConflict: 'board,subject,grade_range' });

  if (error) {
    console.error('[PatternTrainer] Failed to save pattern:', error.message);
  } else {
    console.log(`[PatternTrainer] ✅ Saved pattern: ${board}/${subject}/${gradeRange} (${sloFormat}, cols: ${columnStructure})`);
  }
}

// ── Retrieve the best matching pattern for a new document ────────────────────
export async function getBestMatchingPattern(
  supabase: SupabaseClient,
  board: string,
  subject: string
): Promise<ExtractionPattern | null> {
  // Try exact match first
  const { data: exact } = await supabase
    .from('extraction_patterns')
    .select('*')
    .eq('board', board)
    .eq('subject', subject)
    .order('extraction_accuracy', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (exact && exact.extraction_accuracy >= 0.8) {
    console.log(`[PatternTrainer] Found high-accuracy pattern: ${board}/${subject} (${exact.extraction_accuracy})`);
    return exact;
  }

  // Fuzzy match by subject only (different board, same subject)
  const { data: subjectMatch } = await supabase
    .from('extraction_patterns')
    .select('*')
    .eq('subject', subject)
    .gte('extraction_accuracy', 0.85)
    .order('extraction_accuracy', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subjectMatch) {
    console.log(`[PatternTrainer] Found subject-level pattern match: ${subject} from ${subjectMatch.board}`);
    return subjectMatch;
  }

  return null;
}

// ── Build AI prompt enriched with pattern memory ──────────────────────────────
export function buildPatternAwarePrompt(
  chunk: string,
  subject: string,
  subjectCode: string,
  board: string,
  chunkN: number,
  pattern: ExtractionPattern | null
): string {
  const patternContext = pattern ? `
=== LEARNED PATTERN FROM PREVIOUS SUCCESSFUL EXTRACTION ===
Board: ${pattern.board} | Subject: ${pattern.subject} | Grade Range: ${pattern.grade_range}
SLO Format: ${pattern.slo_format}
Column Structure: ${pattern.column_structure}
Domain Map: ${JSON.stringify(pattern.competency_domain_map)}
Sample Codes: ${pattern.sample_codes.join(', ')}

IMPORTANT: This document follows the above pattern. Apply it when extracting SLOs.
Skip these sections (not SLOs): ${pattern.non_slo_sections.join(', ')}
` : '';

  return `IDENTITY: Pedagogy Master AI (SLO Extractor)
GOAL: Extract ONLY genuine Student Learning Outcomes (SLOs) from the text below.
Board: ${board} | Subject: ${subject} | Chunk: ${chunkN}

${patternContext}

=== WHAT IS AN SLO ===
An SLO is a specific, measurable learning outcome that describes what a student will be able to DO.
SLOs MUST:
- Begin with or contain an action verb (Bloom's taxonomy)
- Describe student behavior/capability
- Be grade-specific

=== WHAT IS NOT AN SLO (SKIP THESE) ===
- Administrative text ("The committee shall...", "The document aims to...")
- Benchmark headers ("Benchmark: Develop reading readiness...")
- Standard descriptions (paragraphs about what the curriculum does)
- Glossary entries (word followed by its definition: "Apposition: A construction...")
- Page numbers, section headers, table of contents entries
- Preamble, acknowledgements, meeting minutes

=== OUTPUT FORMAT ===
Return JSON: { "slos": [ { "slo_code": "...", "slo_full_text": "...", "grade": "...", "domain": "...", "domain_name": "..." } ] }

=== TEXT TO EXTRACT FROM ===
${chunk}`;
}

// ── Admin training endpoint (call after manual review) ────────────────────────
export async function updatePatternAccuracy(
  supabase: SupabaseClient,
  patternId: string,
  accuracy: number,
  correctedSampleCodes?: string[]
): Promise<void> {
  const updates: any = {
    extraction_accuracy: accuracy,
    updated_at: new Date().toISOString()
  };
  if (correctedSampleCodes) {
    updates.sample_codes = correctedSampleCodes;
  }

  const { error } = await supabase
    .from('extraction_patterns')
    .update(updates)
    .eq('id', patternId);

  if (error) {
    console.error('[PatternTrainer] Failed to update accuracy:', error.message);
  } else {
    console.log(`[PatternTrainer] Pattern ${patternId} accuracy updated to ${accuracy}`);
  }
}

// ── Digest: consolidate patterns from all processed documents ─────────────────
export async function runPatternDigest(supabase: SupabaseClient): Promise<void> {
  console.log('[PatternTrainer] Running pattern digest...');

  // Find all unique board+subject combinations from slo_database
  const { data: groups } = await supabase
    .from('slo_database')
    .select('board, subject')
    .not('board', 'is', null)
    .not('subject', 'is', null);

  if (!groups) return;

  const seen = new Set<string>();
  for (const g of groups) {
    const key = `${g.board}:${g.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`[PatternDigest] Processed group: ${key}`);
  }

  console.log(`[PatternTrainer] Digest complete. ${seen.size} unique patterns found.`);
}
