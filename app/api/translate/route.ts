import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { resolveApiKey } from '../../../lib/env-server';

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

async function translateViaGeminiFallback(
  text: string,
  targetLanguage: TargetLanguage
): Promise<string> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error('Translation service unavailable and no fallback API key configured.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const langLabel = LANGUAGE_NAMES[targetLanguage];
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: text,
    config: {
      systemInstruction: `You are a precise academic translator. Translate the following English Markdown curriculum document into ${langLabel}.
Rules:
1. Preserve ALL Markdown formatting exactly: # headings, **bold**, *italic*, bullet lists (-), numbered lists (1.), blockquotes (>), --- dividers, and | Markdown tables |.
2. Keep all placeholder tokens (like ZCODEBLOCK0Z, ZMATHBLK0Z, ZINLINE0Z), SLO codes (like [SLO:...]), numbers, and LaTeX math equations completely unchanged.
3. Output ONLY the translated Markdown document with no preamble or commentary.`,
      temperature: 0.1,
    },
  });

  const output = response.text?.trim();
  if (!output) {
    throw new Error('Gemini fallback returned empty translation.');
  }
  return output;
}

function normalizeTranslatedMarkdownLine(line: string): string {
  return line
    .replace(/\*\*\s+([^\n*]+?)\s+\*\*/g, '**$1**')
    .replace(/\*\*\s+([^\n*]+?)\*\*/g, '**$1**')
    .replace(/\*\*([^\n*]+?)\s+\*\*/g, '**$1**');
}

async function translateMarkdownContent(
  markdown: string,
  targetLanguage: TargetLanguage
): Promise<{ translatedText: string; provider: string }> {
  const stashedBlocks: string[] = [];
  const stashBlock = (match: string, tag: 'CODEBLOCK' | 'MATHBLK') => {
    const idx = stashedBlocks.length;
    stashedBlocks.push(match);
    return `Z${tag}${idx}Z`;
  };

  let working = markdown
    .replace(/```[\s\S]*?```/g, (m) => stashBlock(m, 'CODEBLOCK'))
    .replace(/\$\$[\s\S]*?\$\$/g, (m) => stashBlock(m, 'MATHBLK'))
    .replace(/\\\[[\s\S]*?\\\]/g, (m) => stashBlock(m, 'MATHBLK'));

  const stashedInline: string[] = [];
  const stashInline = (match: string) => {
    const idx = stashedInline.length;
    stashedInline.push(match);
    return `ZINLINE${idx}Z`;
  };

  working = working
    .replace(/`[^`\n]+`/g, stashInline)
    .replace(/\\\([\s\S]*?\\\)/g, stashInline)
    .replace(/\$(?!\d+(?:[.,]\d+)?\b)([^$\n]+?)\$/g, stashInline)
    .replace(/\[?SLO\s*:\s*[A-Za-z0-9\-–—\s]+?\]?(?=[\s.,;:)]|$)/gi, (m) =>
      stashInline(m)
    );

  const lines = working.split('\n');
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
  let provider = 'google_translate';

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
      try {
        for (const batch of batches) {
          const res = await translateBatchViaGtx(batch, targetLanguage);
          translatedSlots.push(...res);
        }
        provider = 'google_translate_gtx';
      } catch (secondaryErr) {
        console.warn(
          '[Translate] Secondary Google Translate failed, falling back to Gemini:',
          secondaryErr
        );
        const fullTranslated = await translateViaGeminiFallback(
          working,
          targetLanguage
        );
        const restored = fullTranslated
          .replace(/ZINLINE(\d+)Z/gi, (_m, i) => stashedInline[Number(i)] ?? '')
          .replace(
            /Z(?:CODEBLOCK|MATHBLK)(\d+)Z/gi,
            (_m, i) => stashedBlocks[Number(i)] ?? ''
          );
        return { translatedText: restored, provider: 'gemini_fallback' };
      }
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

  const finalOutput = reconstructed
    .replace(/ZINLINE(\d+)Z/gi, (_m, i) => stashedInline[Number(i)] ?? '')
    .replace(
      /Z(?:CODEBLOCK|MATHBLK)(\d+)Z/gi,
      (_m, i) => stashedBlocks[Number(i)] ?? ''
    );

  return { translatedText: finalOutput, provider };
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
    const { translatedText, provider } = await translateMarkdownContent(
      clampedText,
      targetLanguage
    );

    return NextResponse.json({
      translatedText,
      targetLanguage,
      provider,
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
