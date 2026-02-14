
import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';

/**
 * HIERARCHICAL PEDAGOGICAL INDEXER (v248.0)
 * Logic: Context-Aware Recursive Segmentation.
 * Implements Protocol 4: Hierarchical Prepending.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  try {
    if (!content || content.length < 50) {
      throw new Error("Target content too sparse for neural indexing.");
    }

    const lines = content.split('\n');
    const dialect = content.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || preExtractedMeta?.dialect || 'Standard';

    let currentGrade = "General Context";
    let currentDomain = "General";
    let currentStandard = "General";
    
    const nodes: any[] = [];
    let buffer = "";
    let codesInChunk = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // DETECT PEDAGOGICAL PARENTAGE (v55 Structural Markers)
      if (line.startsWith('# GRADE')) {
        currentGrade = line.replace('# GRADE', '').trim();
      } else if (line.startsWith('## DOMAIN')) {
        currentDomain = line.replace('## DOMAIN', '').trim();
      } else if (line.startsWith('**Standard:**')) {
        currentStandard = line.replace('**Standard:**', '').trim();
      }

      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => { 
        const normalized = normalizeSLO(c.code);
        if (normalized) codesInChunk.add(normalized);
      });

      buffer += (buffer ? '\n' : '') + line;

      // CHUNK TRIGGER (Optimal for Educational Logic)
      if (buffer.length >= 1000 || i === lines.length - 1) {
        // HIERARCHICAL PREPENDING (Protocol 4)
        // This ensures the vector embedding captures the Grade and Domain context.
        const contextHeader = `[CURRICULUM_CONTEXT: Grade=${currentGrade} | Domain=${currentDomain} | Standard=${currentStandard}]\n`;
        const enrichedText = contextHeader + buffer.trim();

        if (buffer.trim().length > 30) {
          nodes.push({
            text: enrichedText,
            metadata: {
              grade: currentGrade,
              domain: currentDomain,
              standard: currentStandard,
              slo_codes: Array.from(codesInChunk),
              dialect: dialect
            }
          });
        }

        buffer = "";
        codesInChunk.clear();
      }
    }

    if (nodes.length === 0) throw new Error("Segmentation failure.");

    // Clear old vector nodes
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const BATCH_SIZE = 12;
    let chunksWritten = 0;

    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      const texts = batch.map(n => n.text);
      
      try {
        const embeddings = await generateEmbeddingsBatch(texts);
        
        const records = batch.map((node, j) => {
          const vec = embeddings[j];
          if (!vec || vec.length !== 768) return null;

          return {
            document_id: documentId,
            chunk_text: node.text,
            embedding: vec,
            slo_codes: node.metadata.slo_codes,
            metadata: node.metadata,
            chunk_index: i + j
          };
        }).filter(Boolean);

        if (records.length > 0) {
          const { error: insertError } = await supabase.from('document_chunks').insert(records);
          if (insertError) throw insertError;
          chunksWritten += records.length;
        }
      } catch (err) {
        console.error(`❌ Batch Sync Fault [${i}]`);
      }
    }

    await supabase.from('documents').update({ 
      status: 'ready',
      rag_indexed: true,
      chunk_count: chunksWritten,
      master_md_dialect: dialect
    }).eq('id', documentId);

    return { success: true, count: chunksWritten };
  } catch (error: any) {
    console.error("❌ [Indexer Fault]:", error.message);
    throw error;
  }
}
