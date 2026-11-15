import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { getAllGeminiKeys, resolveApiKey } from '../../../lib/env-server';
import {
  StashedMarkdown,
  applySindhiChecksAndBalances,
  normalizeTranslatedMarkdownLine,
  restoreStashedSegments,
  splitMarkdownForContextReview,
  stashNonTranslatableSegments,
} from '../../../lib/translate/sindhi-qa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type TargetLanguage = 'ur' | 'sd';

interface SegmentEntry {
  kind: 'raw' | 'prefixed' | 'table';
  raw?: string;
  prefix?: string;
  slotIndex?: number;
  cells?: Array<{ slotIndex: number | null; raw: string }>;
}

const LANGUAGE_NAMES: Record<TargetLanguage, string> = {
  ur: 'Urdu (اردو)',
  sd: 'Sindhi (سنڌي)',
};

async function translateBatchViaClients5(
  items: string[],
  targetLanguage: TargetLanguage
): Promise<string[]> {
  const params = new URLSearchParams();
  for (const item of items) {
    params.append('q', item);
  }

  const res = await fetch(
    `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=${targetLanguage}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
      body: params,
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!res.ok) {
    throw new Error(`GT_HTTP_${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length !== items.length) {
    throw new Error('GT_RESPONSE_MISMATCH');
  }

  return data.map((entry: unknown) => {
    if (typeof entry === 'string') return entry;
    if (Array.isArray(entry) && typeof entry[0] === 'string') return entry[0];
    return String(entry ?? '');
  });
}

async function translateBatchViaGtx(
  items: string[],
  targetLanguage: TargetLanguage
): Promise<string[]> {
  const results: string[] = [];
  for (const item of items) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(
      item
    )}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      throw new Error(`GTX_HTTP_${res.status}`);
    }
    const json = await res.json();
    const translated = Array.isArray(json?.[0])
      ? json[0].map((seg: unknown[]) => seg?.[0] ?? '').join('')
      : '';
    if (!translated) {
      throw new Error('GTX_EMPTY_RESPONSE');
    }
    results.push(translated);
  }
  return results;
}

async function runGoogleTranslateWorkingText(
  workingText: string,
  targetLanguage: TargetLanguage
): Promise<{ workingTranslated: string; provider: 'google_translate' | 'google_translate_gtx' }> {
  const lines = workingText.split('\n');
  const queue: string[] = [];
  const entries: SegmentEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      /^[-*_]{3,}$/.test(trimmed) ||
      /^Z(?:CODEBLOCK|MATHBLK)\d+Z$/.test(trimmed) ||
      /^\|[\s|:-]+\|$/.test(trimmed)
    ) {
      entries.push({ kind: 'raw', raw: line });
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const rawCells = trimmed.slice(1, -1).split('|');
      const cells = rawCells.map((cell) => {
        const cleanCell = cell.trim();
        if (!cleanCell || /^ZINLINE\d+Z$/.test(cleanCell)) {
          return { slotIndex: null, raw: cleanCell };
        }
        const slotIndex = queue.length;
        queue.push(cleanCell);
        return { slotIndex, raw: cleanCell };
      });
      entries.push({ kind: 'table', cells });
      continue;
    }

    const prefixMatch = line.match(
      /^(\s*(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+))(.*)$/
    );
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      const body = prefixMatch[2].trim();
      if (!body || /^ZINLINE\d+Z$/.test(body)) {
        entries.push({ kind: 'raw', raw: line });
      } else {
        const slotIndex = queue.length;
        queue.push(body);
        entries.push({ kind: 'prefixed', prefix, slotIndex });
      }
      continue;
    }

    const slotIndex = queue.length;
    queue.push(line);
    entries.push({ kind: 'prefixed', prefix: '', slotIndex });
  }

  let translatedSlots: string[] = [];
  let provider: 'google_translate' | 'google_translate_gtx' = 'google_translate';

  if (queue.length > 0) {
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentChars = 0;

    for (const item of queue) {
      if (
        currentBatch.length >= 25 ||
        (currentChars + item.length > 2800 && currentBatch.length > 0)
      ) {
        batches.push(currentBatch);
        currentBatch = [];
        currentChars = 0;
      }
      currentBatch.push(item);
      currentChars += item.length;
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    try {
      for (const batch of batches) {
        const res = await translateBatchViaClients5(batch, targetLanguage);
        translatedSlots.push(...res);
      }
      provider = 'google_translate';
    } catch (primaryErr) {
      console.warn(
        '[Translate] Primary Google Translate endpoint failed, trying secondary:',
        primaryErr
      );
      translatedSlots = [];
      for (const batch of batches) {
        const res = await translateBatchViaGtx(batch, targetLanguage);
        translatedSlots.push(...res);
      }
      provider = 'google_translate_gtx';
    }
  }

  const reconstructed = entries
    .map((entry) => {
      if (entry.kind === 'raw') {
        return entry.raw ?? '';
      }
      if (entry.kind === 'table' && entry.cells) {
        const renderedCells = entry.cells.map((c) => {
          if (c.slotIndex === null) return c.raw;
          return normalizeTranslatedMarkdownLine(
            translatedSlots[c.slotIndex] ?? c.raw
          );
        });
        return `| ${renderedCells.join(' | ')} |`;
      }
      const translatedBody = normalizeTranslatedMarkdownLine(
        translatedSlots[entry.slotIndex ?? -1] ?? ''
      );
      return `${entry.prefix ?? ''}${translatedBody}`;
    })
    .join('\n');

  return { workingTranslated: reconstructed, provider };
}

async function generateWithGeminiFallbackChain(
  systemInstruction: string,
  contents: string
): Promise<string> {
  const keys = getAllGeminiKeys();
  const fallbackKey = resolveApiKey();
  const keyPool = keys.length > 0 ? keys : fallbackKey ? [fallbackKey] : [];

  if (keyPool.length === 0) {
    throw new Error('No Gemini API key configured on server.');
  }

  const modelCandidates = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'] as const;
  let lastError: unknown = null;

  for (const apiKey of keyPool.slice(0, 3)) {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    for (const model of modelCandidates) {
      try {
        const isGemini4 = model.startsWith('gemini-4-');
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            ...(isGemini4
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : { temperature: 0.1 }),
          },
        });
        const output = response.text?.trim();
        if (output) {
          return output;
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gemini translation refinement failed.');
}

async function refineSindhiChunkWithGemini(params: {
  englishChunk: string;
  googleDraftChunk: string | null;
  alreadyGlossedTerms: string[];
}): Promise<string> {
  const { englishChunk, googleDraftChunk, alreadyGlossedTerms } = params;

  const previouslyGlossedNote =
    alreadyGlossedTerms.length > 0
      ? `\n6. ALREADY GLOSSED TERMS (DO NOT add English brackets for these again in this section): ${alreadyGlossedTerms.slice(-40).join(', ')}`
      : '';

  const systemInstruction = `You are a Senior Sindhi Curriculum Linguist, Academic Editor, and Scientific Translator (Sindh Textbook Board standard).
Your task is to deliver an authentic, natural, publication-grade Sindhi (سنڌي) translation of the provided English educational Markdown content.
${googleDraftChunk ? 'An initial Google Translate Sindhi draft is also provided for cross-reference — audit its context carefully and fix any literal phrasing, wrong word order, missing meanings, or non-standard orthography.' : ''}

STRICT QUALITY & FLOW RULES:
1. SINDHI ORTHOGRAPHY & GRAMMAR: Use standard Sindhi Perso-Arabic script (سنڌي، ٻ، ڀ، ٽ، ٺ، ڄ، ڃ، ڇ، ڊ، ڌ، ڏ، ڍ، ڙ، ڦ، ک، گھ، ڳ، ڱ، ڻ، ه، ھ، ي، ى). NEVER use Urdu Bari Yeh (ے). Write in smooth, natural Sindhi SOV academic prose suited for teachers and students.
2. CONTEXTUAL ACCURACY: Translate meaning in full pedagogical context (never word-for-word machine calques). Ensure headings, rubrics, questions, and tables read cohesively.
3. DIFFICULT & SCIENTIFIC TERMS IN BRACKETS (FIRST OCCURRENCE ONLY):
   - For genuinely scientific, technical, or specialized pedagogical terms (e.g., فوٽوسنٿيسس (Photosynthesis)، مائٽوسس (Mitosis)، بلوم جي ٽيڪسونامي (Bloom's Taxonomy)، تشخيصي جائزو (Formative Assessment)، مفروضو (Hypothesis)، ڪشش ثقل (Gravity)), place the exact English term in parentheses immediately after the Sindhi term ONLY ON ITS FIRST APPEARANCE.
   - NEVER repeat the same English term in brackets anywhere later in the text — all later mentions must appear in Sindhi only so prose flows smoothly without repetition.
   - NEVER bracket ordinary everyday words (like Student, Teacher, School, Book, Lesson, Question, Answer, Activity, Time, Example, Class, Grade, Step, Note).
   - Keep bracket usage balanced and readable (do not overcrowd sentences with brackets).
4. MARKDOWN & TOKEN FIDELITY:
   - Preserve ALL Markdown syntax identically (#, ##, ###, **bold**, *italic*, -, 1., >, ---, and | table | columns/rows).
   - Keep ALL placeholder tokens like ZCODEBLOCK0Z, ZMATHBLK0Z, ZINLINE0Z completely intact and unmodified in their exact logical positions.
5. OUTPUT ONLY the final Sindhi Markdown document with zero preamble, notes, or markdown code fences wrapping the whole reply.${previouslyGlossedNote}`;

  const contents = googleDraftChunk
    ? `### ENGLISH SOURCE:\n${englishChunk}\n\n### GOOGLE TRANSLATE SINDHI DRAFT (FOR AUDIT & IMPROVEMENT):\n${googleDraftChunk}`
    : `### ENGLISH SOURCE:\n${englishChunk}`;

  return generateWithGeminiFallbackChain(systemInstruction, contents);
}

async function translateSindhiWithContextQA(stashed: StashedMarkdown): Promise<{
  translatedText: string;
  provider: string;
  qaApplied: boolean;
  bracketedTermsCount: number;
  deduplicatedCount: number;
}> {
  // Stage 1: Fast Google Translate baseline draft (best-effort)
  let draftWorking: string | null = null;
  let baseProvider = 'sindhi_context_qa';
  try {
    const gt = await runGoogleTranslateWorkingText(stashed.workingText, 'sd');
    draftWorking = gt.workingTranslated;
  } catch (gtErr) {
    console.warn('[Translate][Sindhi] Baseline Google Translate unavailable; Gemini will translate directly from English context:', gtErr);
  }

  // Stage 2: Gemini Context Overview + Check & Balance Verification
  const chunks = splitMarkdownForContextReview(stashed.workingText, draftWorking);
  const seenTerms = new Set<string>();
  const keptTermsList: string[] = [];
  let totalDeduplicated = 0;
  let qaChunksSucceeded = 0;

  const reviewedParts: string[] = [];

  for (const chunk of chunks) {
    let candidateChunk: string | null = null;

    try {
      const geminiReviewed = await refineSindhiChunkWithGemini({
        englishChunk: chunk.english,
        googleDraftChunk: chunk.draft,
        alreadyGlossedTerms: keptTermsList,
      });

      const checked = applySindhiChecksAndBalances(
        geminiReviewed,
        chunk.english,
        seenTerms
      );

      if (checked.report.valid) {
        candidateChunk = checked.text;
        keptTermsList.push(...checked.keptTerms);
        totalDeduplicated += checked.report.deduplicatedCount;
        qaChunksSucceeded += 1;
      } else {
        console.warn(
          `[Translate][Sindhi] QA check flagged chunk (${checked.report.reason}); falling back cleanly.`
        );
      }
    } catch (geminiErr) {
      console.warn('[Translate][Sindhi] Gemini context review failed on chunk:', geminiErr);
    }

    if (!candidateChunk) {
      // Fallback to Google Translate draft (or direct chunk translation) passed through Sindhi hygiene checks
      let draftText = chunk.draft;
      if (!draftText) {
        const fallbackGt = await runGoogleTranslateWorkingText(chunk.english, 'sd');
        draftText = fallbackGt.workingTranslated;
      }
      const checkedDraft = applySindhiChecksAndBalances(
        draftText,
        chunk.english,
        seenTerms
      );
      candidateChunk = checkedDraft.text;
      keptTermsList.push(...checkedDraft.keptTerms);
      totalDeduplicated += checkedDraft.report.deduplicatedCount;
    }

    reviewedParts.push(candidateChunk);
  }

  const assembledWorking = reviewedParts.join('\n');
  const restored = restoreStashedSegments(assembledWorking, stashed);

  if (qaChunksSucceeded === 0) {
    baseProvider = 'google_translate_qa_fallback';
  } else if (qaChunksSucceeded < chunks.length) {
    baseProvider = 'sindhi_context_qa_partial';
  }

  return {
    translatedText: restored,
    provider: baseProvider,
    qaApplied: qaChunksSucceeded > 0,
    bracketedTermsCount: keptTermsList.length,
    deduplicatedCount: totalDeduplicated,
  };
}

async function translateViaGeminiFallback(
  text: string,
  targetLanguage: TargetLanguage
): Promise<string> {
  const langLabel = LANGUAGE_NAMES[targetLanguage];
  return generateWithGeminiFallbackChain(
    `You are a precise academic translator. Translate the following English Markdown curriculum document into ${langLabel}.
Rules:
1. Preserve ALL Markdown formatting exactly: # headings, **bold**, *italic*, bullet lists (-), numbered lists (1.), blockquotes (>), --- dividers, and | Markdown tables |.
2. Keep all placeholder tokens (like ZCODEBLOCK0Z, ZMATHBLK0Z, ZINLINE0Z), numbers, and formatting completely unchanged.
3. Output ONLY the translated Markdown document with no preamble or commentary.`,
    text
  );
}

async function translateMarkdownContent(
  markdown: string,
  targetLanguage: TargetLanguage
): Promise<{
  translatedText: string;
  provider: string;
  qaApplied?: boolean;
  bracketedTermsCount?: number;
  deduplicatedCount?: number;
}> {
  const stashed = stashNonTranslatableSegments(markdown);

  if (targetLanguage === 'sd') {
    return translateSindhiWithContextQA(stashed);
  }

  // Urdu ('ur'): Fast Google Translate primary with Gemini fallback
  try {
    const gt = await runGoogleTranslateWorkingText(stashed.workingText, 'ur');
    return {
      translatedText: restoreStashedSegments(gt.workingTranslated, stashed),
      provider: gt.provider,
    };
  } catch (gtErr) {
    console.warn('[Translate][Urdu] Google Translate failed, falling back to Gemini:', gtErr);
    const fullTranslated = await translateViaGeminiFallback(
      stashed.workingText,
      'ur'
    );
    return {
      translatedText: restoreStashedSegments(fullTranslated, stashed),
      provider: 'gemini_fallback',
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token === 'undefined' || token.length < 10) {
      return NextResponse.json({ error: 'Auth Required' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(token);
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });
    }

    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const targetLanguage = body?.targetLanguage as TargetLanguage;

    if (!text) {
      return NextResponse.json(
        { error: 'Translation content is required.' },
        { status: 400 }
      );
    }

    if (targetLanguage !== 'ur' && targetLanguage !== 'sd') {
      return NextResponse.json(
        { error: 'Unsupported target language. Supported: ur (Urdu), sd (Sindhi).' },
        { status: 400 }
      );
    }

    const clampedText = text.slice(0, 60000);
    const result = await translateMarkdownContent(clampedText, targetLanguage);

    return NextResponse.json({
      translatedText: result.translatedText,
      targetLanguage,
      provider: result.provider,
      qaApplied: result.qaApplied ?? false,
      bracketedTermsCount: result.bracketedTermsCount ?? 0,
      deduplicatedCount: result.deduplicatedCount ?? 0,
    });
  } catch (error: any) {
    console.error('[Translate API Fault]:', error);
    return NextResponse.json(
      {
        error: 'Translation service could not complete this request.',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
