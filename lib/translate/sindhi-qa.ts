export interface StashedMarkdown {
  workingText: string;
  stashedBlocks: string[];
  stashedInline: string[];
}

export interface SindhiQualityReport {
  valid: boolean;
  reason?: string;
  missingPlaceholders: string[];
  bracketedTermsCount: number;
  deduplicatedCount: number;
  sindhiCharRatio: number;
}

const COMMON_NON_TECHNICAL_ENGLISH_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'student', 'students', 'teacher', 'teachers', 'educator', 'educators',
  'learner', 'learners', 'child', 'children', 'class', 'classroom', 'school',
  'schools', 'book', 'books', 'lesson', 'lessons', 'unit', 'units', 'chapter',
  'topic', 'topics', 'title', 'subject', 'grade', 'level', 'part', 'section',
  'page', 'pages', 'question', 'questions', 'answer', 'answers', 'example',
  'examples', 'activity', 'activities', 'task', 'tasks', 'work', 'homework',
  'group', 'groups', 'pair', 'pairs', 'individual', 'time', 'minute', 'minutes',
  'hour', 'hours', 'day', 'days', 'week', 'weeks', 'month', 'months', 'year',
  'years', 'step', 'steps', 'note', 'notes', 'summary', 'introduction',
  'conclusion', 'overview', 'goal', 'goals', 'aim', 'objective', 'objectives',
  'method', 'methods', 'material', 'materials', 'resource', 'resources',
  'tool', 'tools', 'table', 'list', 'point', 'points', 'idea', 'ideas',
  'skill', 'skills', 'knowledge', 'understanding', 'practice', 'review',
  'test', 'quiz', 'exam', 'score', 'marks', 'result', 'results', 'feedback',
  'start', 'end', 'begin', 'next', 'first', 'second', 'third', 'last',
  'good', 'better', 'best', 'new', 'old', 'high', 'low', 'easy', 'hard',
  'simple', 'basic', 'main', 'key', 'important', 'general', 'common',
  'yes', 'no', 'true', 'false', 'right', 'wrong', 'correct', 'incorrect',
  'name', 'date', 'word', 'words', 'sentence', 'sentences', 'text', 'reading',
  'writing', 'speaking', 'listening', 'learning', 'teaching', 'study',
  'problem', 'solution', 'reason', 'cause', 'effect', 'change', 'process',
  'system', 'model', 'type', 'types', 'kind', 'kinds', 'form', 'forms',
  'use', 'uses', 'way', 'ways', 'thing', 'things', 'fact', 'facts',
  'water', 'air', 'land', 'sun', 'moon', 'earth', 'plant', 'plants',
  'animal', 'animals', 'human', 'humans', 'body', 'food', 'energy',
  'light', 'heat', 'sound', 'color', 'colour', 'shape', 'size', 'number',
  'numbers', 'count', 'add', 'subtract', 'multiply', 'divide', 'total',
  'equal', 'more', 'less', 'many', 'few', 'all', 'some', 'each', 'every',
]);

export function stashNonTranslatableSegments(markdown: string): StashedMarkdown {
  const stashedBlocks: string[] = [];
  const stashBlock = (match: string, tag: 'CODEBLOCK' | 'MATHBLK') => {
    const idx = stashedBlocks.length;
    stashedBlocks.push(match);
    return `Z${tag}${idx}Z`;
  };

  let workingText = markdown
    .replace(/```[\s\S]*?```/g, (m) => stashBlock(m, 'CODEBLOCK'))
    .replace(/\$\$[\s\S]*?\$\$/g, (m) => stashBlock(m, 'MATHBLK'))
    .replace(/\\\[[\s\S]*?\\\]/g, (m) => stashBlock(m, 'MATHBLK'));

  const stashedInline: string[] = [];
  const stashInline = (match: string) => {
    const idx = stashedInline.length;
    stashedInline.push(match);
    return `ZINLINE${idx}Z`;
  };

  workingText = workingText
    .replace(/`[^`\n]+`/g, stashInline)
    .replace(/\\\([\s\S]*?\\\)/g, stashInline)
    .replace(/\$(?!\d+(?:[.,]\d+)?\b)([^$\n]+?)\$/g, stashInline)
    .replace(/https?:\/\/[^\s)>\]]+/gi, stashInline)
    .replace(/\[?SLO\s*:\s*[A-Za-z0-9\-–—\s]+?\]?(?=[\s.,;:)]|$)/gi, (m) =>
      stashInline(m)
    );

  return { workingText, stashedBlocks, stashedInline };
}

export function restoreStashedSegments(
  text: string,
  stashed: Pick<StashedMarkdown, 'stashedBlocks' | 'stashedInline'>
): string {
  return text
    .replace(/ZINLINE(\d+)Z/gi, (_m, i) => stashed.stashedInline[Number(i)] ?? '')
    .replace(
      /Z(?:CODEBLOCK|MATHBLK)(\d+)Z/gi,
      (_m, i) => stashed.stashedBlocks[Number(i)] ?? ''
    );
}

export function normalizeEnglishTermKey(term: string): string {
  const cleaned = term
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!cleaned) return '';
  const words = cleaned.split(/\s+/);
  const last = words[words.length - 1];
  if (last.length > 4 && last.endsWith('ies')) {
    words[words.length - 1] = `${last.slice(0, -3)}y`;
  } else if (last.length > 4 && last.endsWith('es') && !last.endsWith('ses')) {
    words[words.length - 1] = last.slice(0, -2);
  } else if (last.length > 3 && last.endsWith('s') && !last.endsWith('ss')) {
    words[words.length - 1] = last.slice(0, -1);
  }
  return words.join(' ');
}

function isLikelyQuizMarker(inner: string): boolean {
  const trimmed = inner.trim();
  if (/^[a-zA-Z0-9]$/.test(trimmed)) return true;
  if (/^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(trimmed)) return true;
  if (/^(?:MCQ|MCQs|CRQ|CRQs|ERQ|ERQs|SLO|SLOs|DOK|STEM)$/i.test(trimmed)) return true;
  return false;
}

function isCommonTrivialTerm(inner: string): boolean {
  const normalized = inner.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim();
  if (!normalized) return true;
  if (COMMON_NON_TECHNICAL_ENGLISH_WORDS.has(normalized)) return true;
  const parts = normalized.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 1 && COMMON_NON_TECHNICAL_ENGLISH_WORDS.has(parts[0])) {
    return true;
  }
  return false;
}

export function normalizeTranslatedMarkdownLine(line: string): string {
  return line
    .replace(/\*\*\s+([^\n*]+?)\s+\*\*/g, '**$1**')
    .replace(/\*\*\s+([^\n*]+?)\*\*/g, '**$1**')
    .replace(/\*\*([^\n*]+?)\s+\*\*/g, '**$1**');
}

export function cleanUrduInterferenceInSindhi(text: string): string {
  // Outside ASCII-only segments/tokens, Urdu Bari Yeh (U+06D2 'ے') does not belong in standard Sindhi orthography;
  // replace it with standard Sindhi Yeh (U+064A 'ي').
  return text.replace(/\u06D2/g, '\u064A');
}

export function cleanBracketedEnglishTerms(
  text: string,
  externalSeenTerms?: Set<string>
): {
  cleanedText: string;
  keptTerms: string[];
  deduplicatedCount: number;
} {
  const seenTerms = externalSeenTerms ?? new Set<string>();
  const keptTerms: string[] = [];
  let deduplicatedCount = 0;

  const lines = text.split('\n');
  const processedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^Z(?:CODEBLOCK|MATHBLK)\d+Z$/i.test(trimmed)) {
      return line;
    }

    let keptOnLine = 0;
    const replaced = line.replace(
      /\s*\(([A-Za-z][A-Za-z0-9\s\-'/&+,.:]{0,58})\)/g,
      (fullMatch, rawInner: string) => {
        const inner = rawInner.trim();
        if (!inner || /^Z(?:CODEBLOCK|MATHBLK|INLINE)\d+Z$/i.test(inner)) {
          return fullMatch;
        }
        if (isLikelyQuizMarker(inner)) {
          return fullMatch;
        }
        // Strip pure punctuation/numbers or overly generic single words
        if (isCommonTrivialTerm(inner)) {
          deduplicatedCount += 1;
          return '';
        }

        const key = normalizeEnglishTermKey(inner);
        if (!key) {
          deduplicatedCount += 1;
          return '';
        }

        if (seenTerms.has(key)) {
          deduplicatedCount += 1;
          return '';
        }

        // Balance guard: keep at most 3 new glosses on any single line/bullet to preserve smooth Sindhi reading flow
        if (keptOnLine >= 3) {
          deduplicatedCount += 1;
          return '';
        }

        seenTerms.add(key);
        keptTerms.push(inner);
        keptOnLine += 1;
        return ` (${inner})`;
      }
    );

    return normalizeTranslatedMarkdownLine(
      replaced
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ +([،۔,.;:!?])/g, '$1')
        .replace(/\s+\|\s+/g, ' | ')
        .replace(/\|\s{2,}/g, '| ')
        .replace(/\s{2,}\|/g, ' |')
    );
  });

  return {
    cleanedText: processedLines.join('\n'),
    keptTerms,
    deduplicatedCount,
  };
}

export function extractPlaceholderTokens(text: string): string[] {
  const matches = text.match(/Z(?:CODEBLOCK|MATHBLK|INLINE)\d+Z/g);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

export function verifySindhiOutput(
  refinedWorkingText: string,
  englishWorkingSource: string,
  deduplicatedCount = 0,
  keptTermsCount = 0
): SindhiQualityReport {
  const trimmed = refinedWorkingText.trim();
  if (!trimmed) {
    return {
      valid: false,
      reason: 'EMPTY_OUTPUT',
      missingPlaceholders: extractPlaceholderTokens(englishWorkingSource),
      bracketedTermsCount: keptTermsCount,
      deduplicatedCount,
      sindhiCharRatio: 0,
    };
  }

  const expectedPlaceholders = extractPlaceholderTokens(englishWorkingSource);
  const missingPlaceholders = expectedPlaceholders.filter(
    (token) => !trimmed.includes(token)
  );
  if (missingPlaceholders.length > 0) {
    return {
      valid: false,
      reason: 'MISSING_PLACEHOLDERS',
      missingPlaceholders,
      bracketedTermsCount: keptTermsCount,
      deduplicatedCount,
      sindhiCharRatio: 0,
    };
  }

  const withoutTokens = trimmed
    .replace(/Z(?:CODEBLOCK|MATHBLK|INLINE)\d+Z/g, '')
    .replace(/\([A-Za-z0-9\s\-'/&+,.:]+\)/g, '');
  const arabicChars = (withoutTokens.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (withoutTokens.match(/[A-Za-z]/g) || []).length;
  const totalAlpha = arabicChars + latinChars;
  const sindhiCharRatio = totalAlpha > 0 ? arabicChars / totalAlpha : 1;

  if (totalAlpha > 40 && sindhiCharRatio < 0.35) {
    return {
      valid: false,
      reason: 'LOW_SINDHI_SCRIPT_RATIO',
      missingPlaceholders: [],
      bracketedTermsCount: keptTermsCount,
      deduplicatedCount,
      sindhiCharRatio,
    };
  }

  // Length sanity guard against truncated LLM output
  const sourcePlainLen = englishWorkingSource
    .replace(/Z(?:CODEBLOCK|MATHBLK|INLINE)\d+Z/g, '')
    .trim().length;
  const outputPlainLen = withoutTokens.trim().length;
  if (sourcePlainLen > 120 && outputPlainLen < sourcePlainLen * 0.32) {
    return {
      valid: false,
      reason: 'TRUNCATED_OUTPUT',
      missingPlaceholders: [],
      bracketedTermsCount: keptTermsCount,
      deduplicatedCount,
      sindhiCharRatio,
    };
  }

  return {
    valid: true,
    missingPlaceholders: [],
    bracketedTermsCount: keptTermsCount,
    deduplicatedCount,
    sindhiCharRatio,
  };
}

export function applySindhiChecksAndBalances(
  refinedWorkingText: string,
  englishWorkingSource: string,
  externalSeenTerms?: Set<string>
): { text: string; report: SindhiQualityReport; keptTerms: string[] } {
  const cleanedScript = cleanUrduInterferenceInSindhi(refinedWorkingText);
  const { cleanedText, keptTerms, deduplicatedCount } =
    cleanBracketedEnglishTerms(cleanedScript, externalSeenTerms);
  const report = verifySindhiOutput(
    cleanedText,
    englishWorkingSource,
    deduplicatedCount,
    keptTerms.length
  );
  return { text: cleanedText, report, keptTerms };
}

export function splitMarkdownForContextReview(
  englishWorking: string,
  draftWorking: string | null,
  maxChunkChars = 6500
): Array<{ english: string; draft: string | null }> {
  if (englishWorking.length <= maxChunkChars) {
    return [{ english: englishWorking, draft: draftWorking }];
  }

  const engLines = englishWorking.split('\n');
  const draftLines = draftWorking ? draftWorking.split('\n') : null;

  // If line counts align (as produced by our line-by-line Google Translate pipeline), split cleanly at the same line indices
  const aligned = Boolean(draftLines && draftLines.length === engLines.length);

  const chunks: Array<{ english: string; draft: string | null }> = [];
  let startLine = 0;
  let currentChars = 0;

  for (let i = 0; i < engLines.length; i++) {
    const lineLen = engLines[i].length + 1;
    const isHeadingBreak = /^#{1,3}\s+/.test(engLines[i].trim());
    const isBlankBreak = engLines[i].trim() === '';

    if (
      i > startLine &&
      ((currentChars + lineLen > maxChunkChars && (isHeadingBreak || isBlankBreak)) ||
        currentChars + lineLen > maxChunkChars * 1.25)
    ) {
      chunks.push({
        english: engLines.slice(startLine, i).join('\n'),
        draft: aligned && draftLines ? draftLines.slice(startLine, i).join('\n') : null,
      });
      startLine = i;
      currentChars = 0;
    }
    currentChars += lineLen;
  }

  if (startLine < engLines.length) {
    chunks.push({
      english: engLines.slice(startLine).join('\n'),
      draft: aligned && draftLines ? draftLines.slice(startLine).join('\n') : null,
    });
  }

  return chunks;
}
