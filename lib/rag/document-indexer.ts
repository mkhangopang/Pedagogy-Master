import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';
import { Buffer } from 'buffer';

/**
 * NEURAL VECTOR INDEXER (v8.0 - Signature Fixed + v206 Improvements Merged)
 *
 * ROOT CAUSE FIX: v206 changed the function signature to add `filePath` as
 * 3rd argument, but the calling route passes `supabase` as 3rd argument.
 * This meant every DB call inside the indexer used job.id (a string) as the
 * supabase client — silently failing, writing nothing, but showing 100% in UI.
 *
 * RESTORED: v7 signature (documentId, content, supabase, jobId)
 * KEPT FROM v206: 1500 char chunks, context enrichment, chunk_index fix
 * KEPT FROM v7: normalizeSLO, semantic_fingerprint, token_count, jobId progress
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  supabase: SupabaseClient,   // ← CORRECT: 3rd arg is supabase
  jobId?: string              // ← CORRECT: 4th arg is optional jobId
) {
  try {
    const lines = content.split('\n');
    const dialect = content.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

    // Context trackers — use empty string NOT 'N/A' to avoid integer column crashes
    let currentSubject = '';
    let currentGrade   = '';
    let currentDomain  = '';
    let currentUnit    = '';

    const nodes: any[] = [];
    let buffer = '';
    let codesInChunk = new Set<string>();

    const TARGET_CHUNK_SIZE = 1500; // from v206 — better pedagogical depth
    const MIN_CHUNK_SIZE    = 600;

    for (let i = 0; i < lines.length; i++) {
      const line    = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue;

      // ── Hierarchy detection (v7 + v206 combined) ──────────────────────────
      if (trimmed.match(/^Board:|^Subject:/i)) {
        currentSubject = trimmed.split(':')[1]?.trim() || currentSubject;
      } else if (trimmed.startsWith('# GRADE')) {
        currentGrade = trimmed.replace('# GRADE', '').trim();
      } else if (trimmed.startsWith('### DOMAIN') || trimmed.startsWith('## DOMAIN')) {
        currentDomain = trimmed.replace(/^##+ DOMAIN/, '').trim();
      } else if (trimmed.startsWith('## ')) {
        currentUnit = trimmed.replace('## ', '').trim();
      } else if (trimmed.startsWith('# ') && !trimmed.startsWith('# GRADE')) {
        currentDomain = trimmed.replace('# ', '').trim();
      }

      // ── SLO extraction ─────────────────────────────────────────────────────
      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => {
        const raw = typeof c === 'string' ? c : c.code;
        const normalized = normalizeSLO(raw);
        if (normalized) codesInChunk.add(normalized);
      });

      buffer += (buffer ? '\n' : '') + line;

      const isMajorHeading = trimmed.startsWith('# ') || trimmed.startsWith('## ');
      const isLastLine     = i === lines.length - 1;
      const shouldFlush    =
        buffer.length >= TARGET_CHUNK_SIZE ||
        (isMajorHeading && buffer.length >= MIN_CHUNK_SIZE) ||
        isLastLine;

      if (shouldFlush && buffer.trim().length > 50) {
        // Semantic fingerprint for deduplication (from v7)
        const fingerprint = Buffer.from(buffer.trim())
          .toString('base64')
          .substring(0, 50);

        const subjectLabel = currentSubject || 'General';
        const gradeLabel   = currentGrade   || 'All Grades';
        const domainLabel  = currentDomain  || 'Core';
        const contextPath  = `[NODE_PATH: ${subjectLabel} > ${gradeLabel} > ${domainLabel}]`;
        const enrichedText = `${contextPath}\n${buffer.trim()}`;
        const tokenCount   = Math.max(1, Math.ceil(enrichedText.length / 4));

        nodes.push({
          text: enrichedText,
          fingerprint,
          metadata: {
            subject:      currentSubject || null,
            grade:        currentGrade   || null,
            domain:       currentDomain  || null,
            unit:         currentUnit    || null,
            slo_codes:    Array.from(codesInChunk),
            dialect,
            tokens:       tokenCount,
            is_atomic_slo: codesInChunk.size > 0,
          }
        });

        buffer = '';
        codesInChunk.clear();
      }
    }

    // ── Clear existing chunks for this document ────────────────────────────
    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    // ── Batch embedding + insert ───────────────────────────────────────────
    const BATCH_SIZE = 5; // conservative — stable on Vercel Hobby

    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);

      // Report progress to ingestion job if jobId provided
      if (jobId) {
        await supabase
          .from('ingestion_jobs')
          .update({
            payload: {
              processed: i,
              total:     nodes.length,
              status:    'generating_vectors'
            }
          })
          .eq('id', jobId);
      }

      // Retry up to 2 times on 503/rate-limit before throwing
      let embeddings: number[][] = [];
      let embedAttempt = 0;
      while (embedAttempt < 3) {
        try {
          embeddings = await generateEmbeddingsBatch(batch.map(n => n.text));
          break;
        } catch (embedErr: any) {
          embedAttempt++;
          const is503 = embedErr.message?.includes('503') || embedErr.message?.includes('unavailable') || embedErr.message?.includes('demand');
          if (is503 && embedAttempt < 3) {
            console.warn(`[Indexer] Embedding 503 — retry ${embedAttempt}/3 in ${embedAttempt * 3}s`);
            await new Promise(r => setTimeout(r, embedAttempt * 3000));
          } else {
            throw embedErr;
          }
        }
      }

      const records = batch.map((node, j) => {
        const embedding = embeddings[j];

        // Defensive check — must be flat float array
        if (!Array.isArray(embedding) || typeof embedding[0] !== 'number') {
          console.error(`[Indexer] Invalid embedding at batch ${i} index ${j}`);
          return null;
        }

        return {
          document_id:          documentId,
          chunk_text:           node.text,
          embedding:            embedding,
          slo_codes:            node.metadata.slo_codes || [],
          semantic_fingerprint: node.fingerprint,
          token_count:          Number(node.metadata.tokens) || 1,  // always integer
          chunk_index:          Number(i + j),                       // always integer
          metadata:             node.metadata,
          unit_name:            node.metadata.unit    || null,
          bloom_levels:         [],
          grade_levels:         node.metadata.grade   ? [String(node.metadata.grade)] : [],
          topics:               node.metadata.slo_codes || [],
        };
      }).filter(Boolean);

      if (records.length > 0) {
        const { error: insertError } = await supabase
          .from('document_chunks')
          .insert(records);

        if (insertError) {
          console.error('❌ [Vector Insert Fault]:', insertError.message);
          throw new Error(`Database rejected vector node: ${insertError.message}`);
        }
      }
    }

    console.log(`✅ [Indexer] ${nodes.length} chunks written for document ${documentId}`);
    return { success: true, count: nodes.length };

  } catch (error: any) {
    console.error('❌ [Indexer Context Fault]:', error.message);
    throw error; // re-throw so route catch block sets status=failed correctly
  }
}
