import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';
import { Buffer } from 'buffer';

/**
 * ADVANCED STRUCTURE-AWARE INDEXER (v7.0)
 * Logic: Tree-based chunk graph with Explicit Performance Metrics.
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

    let currentSubject = "N/A";
    let currentGrade = "N/A";
    let currentDomain = "N/A";
    
    const nodes: any[] = [];
    let buffer = "";
    let codesInChunk = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.match(/^Board:|^Subject:/i)) {
        currentSubject = line.split(':')[1]?.trim() || currentSubject;
      } else if (line.startsWith('# GRADE')) {
        currentGrade = line.replace('# GRADE', '').trim();
      } else if (line.startsWith('### DOMAIN')) {
        currentDomain = line.replace('### DOMAIN', '').trim();
      }

      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => { 
        const normalized = normalizeSLO(c.code);
        if (normalized) codesInChunk.add(normalized);
      });

      buffer += (buffer ? '\n' : '') + line;

      if (buffer.length >= 1000 || i === lines.length - 1) {
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
            tokens: Math.max(1, Math.ceil(enrichedText.length / 4))
          }
        });

        buffer = "";
        codesInChunk.clear();
      }
    }

    const BATCH_SIZE = 5; 
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      
      if (jobId) {
        await supabase.from('ingestion_jobs').update({ 
          payload: { processed: i, total: nodes.length, status: 'generating_vectors' } 
        }).eq('id', jobId);
      }

      const embeddings = await generateEmbeddingsBatch(batch.map(n => n.text));
      
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

      const { error: insertError } = await supabase.from('document_chunks').insert(records);
      if (insertError) throw insertError;
    }

    return { success: true, count: nodes.length };
  } catch (error: any) {
    console.error("❌ [Indexer Fault]:", error.message);
    throw error;
  }
}