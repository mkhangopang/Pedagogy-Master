import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';
import { Buffer } from 'buffer';

/**
 * ADVANCED STRUCTURE-AWARE INDEXER (v8.0)
 *
 * STAGE 4 BUG FIXES:
 *
 * BUG 4A (CRITICAL) — Hierarchy context detection was broken.
 *   The ledger produced by buildLedger() uses:
 *     "## Grade 09"     and "### Domain A: Cell Biology"
 *   But the detector was checking for:
 *     "# GRADE" (wrong prefix/case) and "### DOMAIN" (wrong case)
 *   Result: ALL chunks had [NODE_PATH: N/A > N/A > N/A], stripping all
 *   grade and domain context from every RAG chunk.
 *   Fix: Match the actual ledger format with case-insensitive detection.
 *
 * BUG 4B (CRITICAL) — Stale chunks not deleted before re-indexing.
 *   On retry/re-process, new chunks were appended to old ones.
 *   The idempotency check was fragile and couldn't distinguish
 *   fresh-vs-stale when total chunk count changed.
 *   Fix: Delete all existing chunks for the document before inserting new ones.
 *
 * BUG 4C (MAJOR) — STRUCTURED_INDEX JSON blob polluted semantic chunks.
 *   The ledger ends with a large <STRUCTURED_INDEX>...</STRUCTURED_INDEX> block
 *   containing raw JSON. When chunked, JSON fragments produced poor embeddings
 *   that don't semantically match natural language queries.
 *   Fix: Strip the STRUCTURED_INDEX block before chunking. It's used for
 *   direct JSON lookups, not for semantic search.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  supabase: SupabaseClient,
  jobId?: string
) {
  try {
    // BUG 4C FIX: Strip the STRUCTURED_INDEX block — it's JSON, not semantic content
    const contentForIndexing = content
      .replace(/<STRUCTURED_INDEX>[\s\S]*?<\/STRUCTURED_INDEX>/g, '')
      .trim();

    console.log(`[Indexer] Content for indexing: ${contentForIndexing.length} chars (stripped ${content.length - contentForIndexing.length} chars of JSON)`);

    const lines = contentForIndexing.split('\n');
    const dialect = content.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

    let currentSubject = 'N/A';
    let currentGrade = 'N/A';
    let currentDomain = 'N/A';

    const nodes: any[] = [];
    let lineBuffer: string[] = [];
    let currentSize = 0;
    let codesInChunk = new Set<string>();

    const CHUNK_SIZE_LIMIT = 1500;
    const OVERLAP_LINES = 3;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // BUG 4A FIX: Match the ACTUAL ledger format produced by buildLedger().
      //
      // buildLedger() produces:
      //   "# Federal Board — Biology"   (h1 header with board + subject)
      //   "## Grade 09"                  (h2 with "Grade")
      //   "### Domain A: Cell Biology"   (h3 with "Domain")
      //
      // Previous code checked "# GRADE" and "### DOMAIN" (wrong format + wrong case).
      // Now using case-insensitive regexes matching the actual output.

      const h1Match = line.match(/^#\s+(.+)/);
      const gradeMatch = line.match(/^##\s+Grade\s+(\S+)/i);
      const domainMatch = line.match(/^###\s+Domain\s+([A-Z])(?:\s*:\s*(.+))?/i);
      const boardSubjectMatch = line.match(/^Board:\s*(.+)|^Subject:\s*(.+)/i);

      if (h1Match) {
        // H1 is the document title: "Federal Board — Biology"
        currentSubject = h1Match[1].trim();
      } else if (boardSubjectMatch) {
        currentSubject = (boardSubjectMatch[1] || boardSubjectMatch[2] || '').trim() || currentSubject;
      } else if (gradeMatch) {
        currentGrade = gradeMatch[1].trim();
      } else if (domainMatch) {
        const domainLetter = domainMatch[1].toUpperCase();
        const domainName = domainMatch[2]?.trim() || '';
        currentDomain = domainName ? `${domainLetter}: ${domainName}` : domainLetter;
      }

      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => {
        const normalized = normalizeSLO(c.code);
        if (normalized) codesInChunk.add(normalized);
      });

      lineBuffer.push(line);
      currentSize += line.length;

      // Flush chunk if limit reached or end of document
      if (currentSize >= CHUNK_SIZE_LIMIT || i === lines.length - 1) {
        if (lineBuffer.length === 0) continue;

        const buffer = lineBuffer.join('\n');
        const fingerprint = Buffer.from(buffer.trim()).toString('base64').substring(0, 50);

        // BUG 4A FIX: Now that grade/domain are correctly tracked, the context path
        // will be meaningful (e.g., "Federal Board — Biology > 09 > A: Cell Biology")
        const contextPath = `[NODE_PATH: ${currentSubject} > Grade ${currentGrade} > Domain ${currentDomain}]`;
        const enrichedText = `${contextPath}\n${buffer.trim()}`;

        nodes.push({
          text: enrichedText,
          fingerprint,
          metadata: {
            subject: currentSubject,
            grade: currentGrade,
            domain: currentDomain,
            slo_codes: Array.from(codesInChunk),
            dialect,
            tokens: Math.max(1, Math.ceil(enrichedText.length / 4))
          }
        });

        // Overlap: keep last N lines for context continuity
        const actualOverlap = Math.min(lineBuffer.length, OVERLAP_LINES);
        lineBuffer = lineBuffer.slice(lineBuffer.length - actualOverlap);
        currentSize = lineBuffer.reduce((acc, l) => acc + l.length, 0);

        codesInChunk.clear();
        // Re-scan overlap lines so their codes appear in the next chunk too
        lineBuffer.forEach(l => {
          extractSLOCodes(l).forEach(c => {
            const normalized = normalizeSLO(c.code);
            if (normalized) codesInChunk.add(normalized);
          });
        });
      }
    }

    console.log(`[Indexer] Generated ${nodes.length} chunks from ${lines.length} lines`);

    if (nodes.length === 0) {
      console.warn('[Indexer] No chunks generated. Content may be empty or unparseable.');
      return { success: false, count: 0 };
    }

    // BUG 4B FIX: Delete ALL existing chunks for this document before inserting new ones.
    // Previous code used a fragile idempotency check that let stale chunks accumulate.
    // On retry/re-process this caused duplicate chunks with conflicting embeddings.
    const { error: deleteError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteError) {
      console.error('[Indexer] Failed to delete stale chunks:', deleteError);
      // Non-fatal: continue and overwrite. Duplicates are handled by semantic_fingerprint.
    } else {
      console.log('[Indexer] Stale chunks cleared ✓');
    }

    // Insert in batches of 50 to avoid payload limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);

      if (jobId && nodes.length > 0) {
        const progressPercent = Math.round(70 + ((i / nodes.length) * 25));
        await supabase.from('ingestion_jobs').update({
          status: 'processing',
          step: 'EMBED',
          updated_at: new Date().toISOString(),
          payload: {
            processed: i,
            total: nodes.length,
            status: 'generating_vectors',
            progress: progressPercent,
            message: `Vectorizing batch ${Math.ceil(i / BATCH_SIZE) + 1} of ${Math.ceil(nodes.length / BATCH_SIZE)}...`
          }
        }).eq('id', jobId);
      }

      console.log(`[Indexer] Processing batch ${Math.ceil(i / BATCH_SIZE) + 1} of ${Math.ceil(nodes.length / BATCH_SIZE)}`);
      const embeddings = await generateEmbeddingsBatch(batch.map(n => n.text));
      console.log(`[Indexer] Embeddings generated for batch ${Math.ceil(i / BATCH_SIZE) + 1}`);

      const records = batch.map((node, j) => ({
        document_id: documentId,
        chunk_text: node.text,
        embedding: embeddings[j],
        slo_codes: node.metadata.slo_codes,
        semantic_fingerprint: node.fingerprint,
        token_count: node.metadata.tokens,
        chunk_index: i + j,
        metadata: node.metadata
      }));

      const { error: insertError } = await supabase
        .from('document_chunks')
        .insert(records);

      if (insertError) {
        console.error(`[Indexer] Batch insert error:`, insertError);
        throw insertError;
      }
      console.log(`[Indexer] Batch ${Math.ceil(i / BATCH_SIZE) + 1} inserted (${records.length} chunks)`);
    }

    return { success: true, count: nodes.length };

  } catch (error: any) {
    console.error('❌ [Indexer Fault]:', error.message);
    throw error;
  }
}
