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
import {
  buildQuotaExceededMessage,
  checkTranslationQuota,
  getCachedTranslation,
  recordTranslationUsage,
  setCachedTranslation,
} from '../../../lib/translate/quota';

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
      signal: AbortSignal.timeout(10000),
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
      signal: AbortSignal.timeout(8000),
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
      const batchResults = await Promise.all(
        batches.map((batch) => translateBatchViaClients5(batch, targetLanguage))
      );
      translatedSlots = batchResults.flat();
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
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

  const modelCandidates = ['gemini-4-hydrogen', 'gemini-2.5-flash'] as const;
  let lastError: unknown = null;

  for (const apiKey of keyPool.slice(0, 2)) {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    for (const model of modelCandidates) {
      try {
        const isGemini4 = model.startsWith('gemini-4-');
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              ...(isGemini4
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : { temperature: 0.1 }),
            },
          }),
          14000,
          model
        );
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
}): Promise<string> {
  const { englishChunk, googleDraftChunk } = params;

  const systemInstruction = `You are a Senior Sindhi Curriculum Linguist, Academic Editor, and Scientific Translator (Sindh Textbook Board standard).
Deliver an authentic, natural, publication-grade Sindhi (سنڌي) translation of the provided English educational Markdown content.
${googleDraftChunk ? 'An initial Google Translate Sindhi draft is also provided for cross-reference — audit its context carefully and fix any literal phrasing, wrong word order, missing meanings, or non-standard orthography.' : ''}

STRICT QUALITY & FLOW RULES:
1. SINDHI ORTHOGRAPHY & GRAMMAR: Use standard Sindhi Perso-Arabic script (سنڌي، ٻ، ڀ، ٽ، ٺ، ڄ، ڃ، ڇ، ڊ، ڌ، ڏ، ڍ، ڙ، ڦ، ک، گھ، ڳ، ڱ، ڻ، ه، ھ، ي، ى). NEVER use Urdu Bari Yeh (ے). Write in smooth, natural Sindhi SOV academic prose suited for teachers and students.
2. CONTEXTUAL ACCURACY: Translate meaning in full pedagogical context (never word-for-word machine calques). Ensure headings, rubrics, questions, and tables read cohesively.
3. DIFFICULT & SCIENTIFIC TERMS IN BRACKETS (FIRST OCCURRENCE ONLY):
   - For genuinely scientific, technical, or specialized pedagogical terms (e.g., فوٽوسنٿيسس (Photosynthesis)، مائٽوسس (Mitosis)، بلوم جي ٽيڪسونامي (Bloom's Taxonomy)، تشخيصي جائزو (Formative Assessment)، مفروضو (Hypothesis)، ڪشش ثقل (Gravity)), place the exact English term in parentheses immediately after the Sindhi term ONLY ON ITS FIRST APPEARANCE.
   - NEVER repeat the same English term in brackets anywhere later in the text — all later mentions must appear in Sindhi only so prose flows smoothly without repetition.
   - NEVER bracket ordinary everyday words (like Student, Teacher, School, Book, Lesson, Question, Answer, Activity, Time, Example, Class, Grade, Step, Note).
   - Keep bracket usage balanced and readable.
4. MARKDOWN & TOKEN FIDELITY:
   - Preserve ALL Markdown syntax identically (#, ##, ###, **bold**, *italic*, -, 1., >, ---, and | table | columns/rows).
   - Keep ALL placeholder tokens like ZCODEBLOCK0Z, ZMATHBLK0Z, ZINLINE0Z completely intact and unmodified in their exact logical positions.
5. OUTPUT ONLY the final Sindhi Markdown document with zero preamble or commentary.`;

  const contents = googleDraftChunk
    ? `### ENGLISH SOURCE:\n${englishChunk}\n\n### GOOGLE TRANSLATE SINDHI DRAFT (FOR AUDIT & IMPROVEMENT):\n${googleDraftChunk}`
    : `### ENGLISH SOURCE:\n${englishChunk}`;

  return generateWithGeminiFallbackChain(systemInstruction, contents);
}

async function translateSindhiWithContextQA(
  stashed: StashedMarkdown,
  onProgress?: (event: Record<string, unknown>) => void
): Promise<{
  translatedText: string;
  provider: string;
  qaApplied: boolean;
  bracketedTermsCount: number;
  deduplicatedCount: number;
}> {
  // Stage 1: Fast Google Translate baseline draft (best-effort)
  let draftWorking: string | null = null;
  try {
    const gt = await runGoogleTranslateWorkingText(stashed.workingText, 'sd');
    draftWorking = gt.workingTranslated;

    // Emit clean baseline draft immediately so clients never fail even if downstream LLM times out
    const baselineSeen = new Set<string>();
    const baselineChecked = applySindhiChecksAndBalances(
      draftWorking,
      stashed.workingText,
      baselineSeen
    );
    onProgress?.({
      type: 'draft',
      translatedText: restoreStashedSegments(baselineChecked.text, stashed),
      provider: 'google_translate_qa_draft',
    });
  } catch (gtErr) {
    console.warn(
      '[Translate][Sindhi] Baseline Google Translate unavailable; Gemini will translate directly from English context:',
      gtErr
    );
  }

  onProgress?.({
    type: 'status',
    message: 'Refining Sindhi grammar & scientific terms with Gemini QA...',
  });

  // Stage 2: Parallel Gemini Context Overview across large section chunks (up to 9,000 chars each)
  const chunks = splitMarkdownForContextReview(
    stashed.workingText,
    draftWorking,
    9000
  );

  const rawChunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const geminiText = await refineSindhiChunkWithGemini({
          englishChunk: chunk.english,
          googleDraftChunk: chunk.draft,
        });
        return { chunk, geminiText };
      } catch (geminiErr) {
        console.warn('[Translate][Sindhi] Gemini context review failed on chunk:', geminiErr);
        return { chunk, geminiText: null };
      }
    })
  );

  // Stage 3: Sequential Cross-Chunk Checks & Balances (guarantees 1st-occurrence-only English brackets across the whole document)
  const globalSeenTerms = new Set<string>();
  const keptTermsList: string[] = [];
  let totalDeduplicated = 0;
  let qaChunksSucceeded = 0;
  const reviewedParts: string[] = [];

  for (const { chunk, geminiText } of rawChunkResults) {
    let acceptedChunk: string | null = null;

    if (geminiText) {
      const checked = applySindhiChecksAndBalances(
        geminiText,
        chunk.english,
        globalSeenTerms
      );
      if (checked.report.valid) {
        acceptedChunk = checked.text;
        keptTermsList.push(...checked.keptTerms);
        totalDeduplicated += checked.report.deduplicatedCount;
        qaChunksSucceeded += 1;
      } else {
        console.warn(
          `[Translate][Sindhi] QA check flagged chunk (${checked.report.reason}); falling back cleanly.`
        );
      }
    }

    if (!acceptedChunk) {
      let draftText = chunk.draft;
      if (!draftText) {
        const fallbackGt = await runGoogleTranslateWorkingText(chunk.english, 'sd');
        draftText = fallbackGt.workingTranslated;
      }
      const checkedDraft = applySindhiChecksAndBalances(
        draftText,
        chunk.english,
        globalSeenTerms
      );
      acceptedChunk = checkedDraft.text;
      keptTermsList.push(...checkedDraft.keptTerms);
      totalDeduplicated += checkedDraft.report.deduplicatedCount;
    }

    reviewedParts.push(acceptedChunk);
  }

  const assembledWorking = reviewedParts.join('\n');
  const restored = restoreStashedSegments(assembledWorking, stashed);

  let provider = 'sindhi_context_qa';
  if (qaChunksSucceeded === 0) {
    provider = 'google_translate_qa_fallback';
  } else if (qaChunksSucceeded < chunks.length) {
    provider = 'sindhi_context_qa_partial';
  }

  return {
    translatedText: restored,
    provider,
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
  targetLanguage: TargetLanguage,
  onProgress?: (event: Record<string, unknown>) => void
): Promise<{
  translatedText: string;
  provider: string;
  qaApplied?: boolean;
  bracketedTermsCount?: number;
  deduplicatedCount?: number;
}> {
  const stashed = stashNonTranslatableSegments(markdown);

  if (targetLanguage === 'sd') {
    return translateSindhiWithContextQA(stashed, onProgress);
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
    const useStream = Boolean(body?.stream);

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
    const quota = await checkTranslationQuota(supabase, user.id, user.email);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: buildQuotaExceededMessage(quota),
          code: 'TRANSLATION_QUOTA_EXCEEDED',
          quota,
        },
        { status: 429 }
      );
    }

    const executeWithCacheAndQuota = async (
      onProgress?: (event: Record<string, unknown>) => void
    ) => {
      const cached = await getCachedTranslation(clampedText, targetLanguage);
      if (cached?.translatedText) {
        const updatedQuota = await recordTranslationUsage({
          supabase,
          userId: user.id,
          authEmail: user.email,
          targetLanguage,
          provider: cached.provider,
          charLength: clampedText.length,
          cacheHit: true,
        });
        return {
          ...cached,
          targetLanguage,
          cacheHit: true,
          quota: updatedQuota,
        };
      }

      const result = await translateMarkdownContent(
        clampedText,
        targetLanguage,
        onProgress
      );

      await setCachedTranslation(clampedText, targetLanguage, {
        translatedText: result.translatedText,
        provider: result.provider,
        qaApplied: result.qaApplied ?? false,
        bracketedTermsCount: result.bracketedTermsCount ?? 0,
        deduplicatedCount: result.deduplicatedCount ?? 0,
      });

      const updatedQuota = await recordTranslationUsage({
        supabase,
        userId: user.id,
        authEmail: user.email,
        targetLanguage,
        provider: result.provider,
        charLength: clampedText.length,
        cacheHit: false,
      });

      return {
        translatedText: result.translatedText,
        targetLanguage,
        provider: result.provider,
        qaApplied: result.qaApplied ?? false,
        bracketedTermsCount: result.bracketedTermsCount ?? 0,
        deduplicatedCount: result.deduplicatedCount ?? 0,
        cacheHit: false,
        quota: updatedQuota,
      };
    };

    if (useStream) {
      const encoder = new TextEncoder();
      const responseStream = new ReadableStream({
        async start(controller) {
          let closed = false;
          const sendEvent = (payload: Record<string, unknown>) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
            } catch {
              closed = true;
            }
          };

          // Flush immediate initial chunk to prevent gateway/Vercel 504 timeouts
          sendEvent({
            type: 'status',
            message:
              targetLanguage === 'sd'
                ? 'Translating Sindhi baseline...'
                : 'Translating to Urdu...',
          });

          const heartbeat = setInterval(() => {
            sendEvent({ type: 'status', message: 'Verifying translation...' });
          }, 2500);

          try {
            const payload = await executeWithCacheAndQuota(sendEvent);
            sendEvent({
              type: 'result',
              ...payload,
            });
          } catch (err: any) {
            console.error('[Translate Stream Fault]:', err);
            sendEvent({
              type: 'error',
              error:
                err?.message ||
                'Translation service could not complete this request.',
            });
          } finally {
            clearInterval(heartbeat);
            if (!closed) {
              closed = true;
              controller.close();
            }
          }
        },
      });

      return new Response(responseStream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const payload = await executeWithCacheAndQuota();
    return NextResponse.json(payload);
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
