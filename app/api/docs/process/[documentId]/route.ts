// app/api/docs/process/[documentId]/route.ts
// PEDAGOGY MASTER AI — Ingestion Engine v7.2 (Claude Logic Gaps Fixed)

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep } from '../../../../../types';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';
import pdf from 'pdf-parse';
import { GoogleGenAI } from "@google/genai";

export const runtime = 'nodejs';
export const maxDuration = 300;

const MODEL_PRIMARY = 'gemini-2.0-flash';
const MODEL_FALLBACK = 'gemini-1.5-flash';

// ... (keep all your lookup tables and detection functions exactly as they are) ...

// ── FIXED HELPERS ─────────────────────────────────────────────────────────────
function linearizeSloText(text: string): string {
  return text
    .replace(/Page \d+ of \d+/gi, '')
    .replace(/© .*?Board/gi, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

function extractRawSloBlocks(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split('\n');
  let current = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[A-Z]\d{2}[A-Z]\d/.test(trimmed) || trimmed.includes('SLO') || trimmed.includes('Student Learning Outcome')) {
      if (current) blocks.push(current.trim());
      current = line;
    } else if (current) {
      current += '\n' + line;
    }
  }
  if (current) blocks.push(current.trim());
  return blocks.length > 0 ? blocks : [text];
}

function buildLedger(slos: any[], boardKey: string, subjectCode: string): string {
  let ledger = `# ${BOARD_NAMES[boardKey] || boardKey} - ${subjectCode} SLO Ledger\n\n`;
  
  // FIXED: Proper numeric sort for SLO codes (handles 100+)
  const sorted = [...slos].sort((a, b) => {
    const numA = parseInt(a.slo_code.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.slo_code.replace(/\D/g, '')) || 0;
    return numA - numB;
  });

  sorted.forEach(s => {
    ledger += `**${s.slo_code}** — ${s.slo_full_text}\nBloom: ${s.bloom_level || 'Remember'}\n\n`;
  });
  return ledger;
}

// ... keep makePrompt, callAIOrchestrator, processSlos, safeJson exactly as before ...

async function extractSlos(...) {
  // ... existing code ...

  // FIXED: Global deduplication across ALL chunks
  const seen = new Set<string>();
  const uniqueSlos: any[] = [];

  for (const slo of allSlos) {
    if (!seen.has(slo.slo_code)) {
      seen.add(slo.slo_code);
      uniqueSlos.push(slo);
    }
  }
  return uniqueSlos;
}

// ── MAIN ROUTE (with Claude fixes) ───────────────────────────────────────────
export async function POST(...) {
  // ... auth and job guard (keep your latest version) ...

  // STAGE 2: LINEARIZE — always clean old data first
  if (job.step === IngestionStep.LINEARIZE) {
    // FIXED: Always delete previous SLOs for this document on every run
    await supabase.from('slo_database').delete().eq('document_id', documentId);

    // ... rest of extraction ...
  }

  // STAGE 4: EMBED
  if (job.step === IngestionStep.EMBED) {
    // ... existing embed code ...

    await queue.markComplete(job.id);

    const { error: dErr } = await supabase.from('documents')
      .update({ status: 'ready', rag_indexed: true, updated_at: new Date().toISOString() })
      .eq('id', documentId);

    if (dErr) console.error('[Stage 4] Document update failed:', dErr.message);
  }

  // ... rest of your route ...
}
