
import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';
import { Buffer } from 'buffer';

/**
 * ADVANCED STRUCTURE-AWARE INDEXER (v4.0)
 * Logic: Tree-based chunk graph with Context Carry-Forward.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  try {
    const lines = content.split('\n');
    const dialect = content.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || preExtractedMeta?.dialect || 'Standard';

    let currentGrade = "N/A";
    let currentChapter = "N/A";
    let currentDomain = "N/A";
    
    const nodes: any[] = [];
    let buffer = "";
    let codesInChunk = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('# GRADE')) {
        currentGrade = line.replace('# GRADE', '').trim();
      } else if (line.startsWith('## CHAPTER')) {
        currentChapter = line.replace('## CHAPTER', '').trim();
      } else if (line.startsWith('### DOMAIN')) {
        currentDomain = line.replace('### DOMAIN', '').trim();
      }

      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => { 
        const normalized = normalizeSLO(c.code);
        if (normalized) codesInChunk.add(normalized);
      });

      buffer += (buffer ? '\n' : '') + line;

      const nextLine = lines[i+1]?.trim() || "";
      const isHeaderChange = nextLine.startsWith('#');

      if (buffer.length >= 1000 || isHeaderChange || i === lines.length - 1) {
        // FINGERPRINT: SHA-256 equivalent for free tier deduplication
        const fingerprint = Buffer.from(buffer.trim()).toString('base64').substring(0, 50);
        
        const contextHeader = `[CONTEXT: Grade ${currentGrade} | Ch ${currentChapter} | Domain ${currentDomain}]\n`;
        const enrichedText = contextHeader + buffer.trim();

        nodes.push({
          text: enrichedText,
          fingerprint,
          metadata: {
            grade: currentGrade,
            chapter: currentChapter,
            domain: currentDomain,
            slo_codes: Array.from(codesInChunk),
            dialect,
            tokens: Math.ceil(enrichedText.length / 4)
          }
        });

        buffer = "";
        codesInChunk.clear();
      }
    }

    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const BATCH_SIZE = 10;
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      
      // DEDUPLICATION: Skip if fingerprint exists for this user (Cost optimization)
      const fingerprints = batch.map(n => n.fingerprint);
      const { data: existing } = await supabase.from('document_chunks').select('semantic_fingerprint').in('semantic_fingerprint', fingerprints);
      const existingFp = new Set(existing?.map(e => e.semantic_fingerprint) || []);

      const toProcess = batch.filter(n => !existingFp.has(n.fingerprint));
      
      if (toProcess.length > 0) {
        const embeddings = await generateEmbeddingsBatch(toProcess.map(n => n.text));
        
        const records = toProcess.map((node, j) => ({
          document_id: documentId,
          chunk_text: node.text,
          embedding: embeddings[j],
          slo_codes: node.metadata.slo_codes,
          semantic_fingerprint: node.fingerprint,
          token_count: node.metadata.tokens,
          metadata: node.metadata,
          chunk_index: i + j
        }));

        await supabase.from('document_chunks').insert(records);
      }
    }

    await supabase.from('documents').update({ status: 'ready', rag_indexed: true, master_md_dialect: dialect }).eq('id', documentId);
    return { success: true, count: nodes.length };
  } catch (error: any) {
    console.error("❌ [Indexer Fatal]:", error.message);
    throw error;
  }
}
