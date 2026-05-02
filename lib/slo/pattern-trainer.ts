/**
 * SLO PATTERN MEMORY TRAINER (v2.0)
 *
 * FIX-06: Fixed empty compDomainMap else-branch.
 *   Previously the else-if matched SLO codes but had EMPTY body — nothing was
 *   ever written to compDomainMap from code inference. The pattern saved a
 *   hardcoded fallback {1:A, 2:B, 3:C, 4:D} every time, defeating the purpose
 *   of pattern learning for non-English subjects.
 *
 * Now: infers domain letter from code format [SUBJ][GRADE][DOMAIN][SEQ],
 *   builds a stable numeric→letter map ordered by first appearance.
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

  const sampleCodes = extractedSlos.slice(0, 10).map((s: any) => s.slo_code).filter(Boolean);
  const gradeRange = detectGradeRange(rawText, sampleCodes);
  const sloFormat = detectSLOFormat(rawText);
  const columnStructure = detectColumnStructure(rawText);

  // ── FIX-06: Build competency→domain map from actual SLO data ──────────────
  // Previous code had an empty else-if branch — the map was never populated
  // from code inference, so every pattern saved the same hardcoded fallback.
  //
  // Strategy:
  //   1. If SLO has explicit competency+domain fields: use them directly.
  //   2. Otherwise: parse the domain letter from the SLO code format
  //      [SUBJ][GRADE][DOMAIN_LETTER][SEQ] e.g. "E07B03" → domain "B".
  //      Assign stable numeric keys (1, 2, 3...) in order of first appearance.
  const compDomainMap: Record<string, string> = {};
  const domainOrder: string[] = []; // tracks insertion order for stable numeric keys

  for (const slo of extractedSlos) {
    if (slo.competency && slo.domain) {
      // Explicit fields present: use directly
      const key = String(slo.competency).trim();
      const val = String(slo.domain).toUpperCase().match(/^([A-Z])/)?.[1];
      if (key && val) compDomainMap[key] = val;
    } else if (slo.slo_code) {
      // FIX: infer domain letter from code pattern [A-Z]{1,4}[0-9]{2}[A-Z][0-9]{2}
      const codeMatch = slo.slo_code.match(/^[A-Z]{1,4}\d{2}([A-Z])\d{2}$/);
      if (codeMatch) {
        const domainLetter = codeMatch[1];
        if (!domainOrder.includes(domainLetter)) {
          domainOrder.push(domainLetter);
        }
        const compKey = String(domainOrder.indexOf(domainLetter) + 1);
        if (!compDomainMap[compKey]) {
          compDomainMap[compKey] = domainLetter;
        }
      }
    }
  }

  // Only use hardcoded fallback if we truly got nothing — and log a warning
  const finalMap = Object.keys(compDomainMap).length > 0
    ? compDomainMap
    : { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };

  if (Object.keys(compDomainMap).length === 0) {
    console.warn('[PatternTrainer] Could not infer competency→domain map from SLO data. Using generic fallback.');
  }

  // Detect grade section headers
  const headerPatterns: string[] = [];
  const headerRe = /^(Class|Grade|Competency)\s+[\w\s\-–]+/gm;
  let hMatch;
  while ((hMatch = headerRe.exec(rawText)) !== null) {
    const h = hMatch[0].trim();
    if (!headerPatterns.includes(h) && headerPatterns.length < 10) {
      headerPatterns.push(h);
    }
  }

  const nonSloSections = [
    'Preamble', 'Section 1', 'Section 4', 'Section 5', 'Section 6',
    'Section 7', 'Section 8', 'Glossary', 'Acknowledgement',
    'Minutes of meeting', 'Table of Contents',
  ];

  const pattern: ExtractionPattern = {
    board,
    subject,
    grade_range: gradeRange,
    slo_format: sloFormat,
    column_structure: columnStructure,
    competency_domain_map: finalMap,
    grade_section_headers: headerPatterns,
    non_slo_sections: nonSloSections,
    sample_codes: sampleCodes.slice(0, 5),
    total_slos_extracted: extractedSlos.length,
    extraction_accuracy: 0.9,
  };

  const { error } = await supabase
    .from('extraction_patterns')
    .upsert(pattern, { onConflict: 'board,subject,grade_range' });

  if (error) {
    console.error('[PatternTrainer] Failed to save pattern:', error.message);
  } else {
    console.log(`[PatternTrainer] ✅ Saved: ${board}/${subject}/${gradeRange} (${sloFormat}, cols: ${columnStructure}), domainMap: ${JSON.stringify(finalMap)}`);
  }
}

export async function getBestMatchingPattern(
  supabase: SupabaseClient,
  board: string,
  subject: string
): Promise<ExtractionPattern | null> {
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

  const { data: subjectMatch } = await supabase
    .from('extraction_patterns')
    .select('*')
    .eq('subject', subject)
    .gte('extraction_accuracy', 0.85)
    .order('extraction_accuracy', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subjectMatch) {
    console.log(`[PatternTrainer] Found subject-level pattern: ${subject} from ${subjectMatch.board}`);
    return subjectMatch;
  }

  return null;
}

export function buildPatternAwarePrompt(
  chunk: string,
  subject: string,
  subjectCode: string,
  board: string,
  chunkN: number,
  pattern: ExtractionPattern | null
): string {
  const patternContext = pattern
    ? `
=== LEARNED PATTERN FROM PREVIOUS SUCCESSFUL EXTRACTION ===
Board: ${pattern.board} | Subject: ${pattern.subject} | Grade Range: ${pattern.grade_range}
SLO Format: ${pattern.slo_format}
Column Structure: ${pattern.column_structure}
Domain Map: ${JSON.stringify(pattern.competency_domain_map)}
Sample Codes: ${pattern.sample_codes.join(', ')}
Skip these non-SLO sections: ${pattern.non_slo_sections.join(', ')}
`
    : '';

  return `IDENTITY: Pedagogy Master AI (SLO Extractor)
GOAL: Extract ONLY genuine Student Learning Outcomes (SLOs) from the text below.
Board: ${board} | Subject: ${subject} | Chunk: ${chunkN}

${patternContext}

=== WHAT IS AN SLO ===
An SLO is specific, measurable, and describes what a student will be able to DO.
SLOs MUST begin with or contain a Bloom's taxonomy action verb.

=== WHAT IS NOT AN SLO (SKIP) ===
- Administrative text, benchmark headers, glossary entries, page numbers, TOC

=== OUTPUT FORMAT ===
Return JSON: { "slos": [ { "slo_code": "...", "slo_full_text": "...", "grade": "...", "domain": "...", "domain_name": "..." } ] }

=== TEXT TO EXTRACT FROM ===
${chunk}`;
}

export async function updatePatternAccuracy(
  supabase: SupabaseClient,
  patternId: string,
  accuracy: number,
  correctedSampleCodes?: string[]
): Promise<void> {
  const updates: any = { extraction_accuracy: accuracy, updated_at: new Date().toISOString() };
  if (correctedSampleCodes) updates.sample_codes = correctedSampleCodes;
  const { error } = await supabase.from('extraction_patterns').update(updates).eq('id', patternId);
  if (error) console.error('[PatternTrainer] Failed to update accuracy:', error.message);
  else console.log(`[PatternTrainer] Pattern ${patternId} accuracy → ${accuracy}`);
}
