import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';
import { Buffer } from 'buffer';

/**
 * ADVANCED STRUCTURE-AWARE INDEXER (v8.0)
 *
 * FIX-03: Skip null embeddings — NEVER insert zero-vectors into pgvector.
 * FIX-04: Upsert on semantic_fingerprint to prevent duplicates on resume/retry.
 * FIX-05: Idempotency check now counts by fingerprint, not by index range.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  supabase: SupabaseClient,
  jobId?: string
) {
  try {
    const lines = content.split('\n');
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

      if (line.match(/^Board:|^Subject:/i)) {
        currentSubject = line.split(':')[1]?.trim() || currentSubject;
      } else if (line.startsWith('# GRADE') || line.startsWith('## Grade')) {
        currentGrade = line.replace(/^#{1,3}\s*(GRADE|Grade)\s*/i, '').trim();
      } else if (line.startsWith('### DOMAIN') || line.startsWith('### Domain')) {
        currentDomain = line.replace(/^###\s*(DOMAIN|Domain)\s*/i, '').trim();
      }

      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => {
        const normalized = normalizeSLO(c.code);
        if (normalized) codesInChunk.add(normalized);
      });

      lineBuffer.push(line);
      currentSize += line.length;

      if (currentSize >= CHUNK_SIZE_LIMIT || i === lines.length - 1) {
        const buffer = lineBuffer.join('\n');
        const fingerprint = Buffer.from(buffer.trim()).toString('base64').substring(0, 50);
        const contextPath = `[NODE_PATH: ${currentSubject} > ${currentGrade} > ${currentDomain}]`;
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
            tokens: Math.max(1, Math.ceil(enrichedText.length / 4)),
          },
        });

        const actualOverlap = Math.min(lineBuffer.length, OVERLAP_LINES);
        lineBuffer = lineBuffer.slice(lineBuffer.length - actualOverlap);
        currentSize = lineBuffer.reduce((acc, l) => acc + l.length, 0);
        codesInChunk.clear();
        lineBuffer.forEach(l => {
          extractSLOCodes(l).forEach(c => {
            const normalized = normalizeSLO(c.code);
            if (normalized) codesInChunk.add(normalized);
          });
        });
      }
    }

    const BATCH_SIZE = 50;

    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);

      // FIX-05: Idempotency by fingerprint — count already-indexed fingerprints
      const fingerprints = batch.map(n => n.fingerprint);
      const { count: alreadyIndexed } = await supabase
        .from('document_chunks')
        .select('semantic_fingerprint', { count: 'exact', head: true })
        .eq('document_id', documentId)
        .in('semantic_fingerprint', fingerprints);

      if (alreadyIndexed === batch.length) {
        console.log(`Batch ${i / BATCH_SIZE + 1}: all ${batch.length} chunks already indexed. Skipping.`);
        continue;
      }

      if (jobId && nodes.length > 0) {
        const progressPercent = Math.round(70 + (i / nodes.length) * 25);
        await supabase.from('ingestion_jobs').update({
          status: 'processing',
          step: 'EMBED',
          updated_at: new Date().toISOString(),
          payload: {
            processed: i,
            total: nodes.length,
            status: 'generating_vectors',
            progress: progressPercent,
            message: `Vectorizing batch ${Math.ceil(i / BATCH_SIZE) + 1} of ${Math.ceil(nodes.length / BATCH_SIZE)}...`,
          },
        }).eq('id', jobId);
      }

      console.log(`Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(nodes.length / BATCH_SIZE)}`);

      // FIX-03: generateEmbeddingsBatch now returns (number[] | null)[]
      const embeddings = await generateEmbeddingsBatch(batch.map(n => n.text));
      console.log(`Embeddings generated for batch ${i / BATCH_SIZE + 1}`);

      // FIX-03 + FIX-04: Skip null embeddings. Upsert to prevent duplicates.
      const records = batch
        .map((node, j) => {
          const vec = embeddings[j];
          if (!vec) {
            console.warn(
              `[Indexer] Skipping chunk ${i + j} (fingerprint: ${node.fingerprint}) — embedding returned null. Will retry on next ingestion.`
            );
            return null;
          }
          return {
            document_id: documentId,
            chunk_text: node.text,
            embedding: vec,
            slo_codes: node.metadata.slo_codes,
            semantic_fingerprint: node.fingerprint,
            token_count: node.metadata.tokens,
            chunk_index: i + j,
            metadata: node.metadata,
          };
        })
        .filter(Boolean) as any[];

      if (records.length === 0) {
        console.warn(`[Indexer] All embeddings in batch ${i / BATCH_SIZE + 1} failed — skipping insertion.`);
        continue;
      }

      // FIX-04: Upsert on semantic_fingerprint (unique constraint) prevents duplicates
      const { error: upsertError } = await supabase
        .from('document_chunks')
        .upsert(records, { onConflict: 'semantic_fingerprint', ignoreDuplicates: true });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        throw upsertError;
      }
      console.log(`Batch ${i / BATCH_SIZE + 1} upserted: ${records.length} chunks`);
    }

    return { success: true, count: nodes.length };
  } catch (error: any) {
    console.error('❌ [Indexer Fault]:', error.message);
    throw error;
  }
}
