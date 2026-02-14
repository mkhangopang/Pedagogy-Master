import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';

/**
 * HIERARCHICAL PEDAGOGICAL INDEXER (v250.0)
 * Logic: Hierarchical Context Injection.
 * Optimized for: Grade-Domain-Standard preservation.
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
      throw new Error("Content node too sparse for indexing.");
    }

    const lines = content.split('\n');
    const dialect = content.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || preExtractedMeta?.dialect || 'Standard';

    let currentGrade = "N/A";
    let currentDomain = "N/A";
    let currentStandard = "General";
    
    const nodes: any[] = [];
    let buffer = "";
    let codesInChunk = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // HIERARCHY DETECTION
      if (line.startsWith('# GRADE')) {
        currentGrade = line.replace('# GRADE', '').trim();
      } else if (line.startsWith('## DOMAIN')) {
        currentDomain = line.replace('## DOMAIN', '').trim();
      } else if (line.startsWith('**Standard:**')) {
        currentStandard = line.replace('**Standard:**', '').trim();
      }

      // SLO CODE EXTRACTION
      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => { 
        const normalized = normalizeSLO(c.code);
        if (normalized) codesInChunk.add(normalized);
      });

      buffer += (buffer ? '\n' : '') + line;

      // CHUNK SEGMENTATION (800 chars average for pedagogical density)
      if (buffer.length >= 800 || i === lines.length - 1) {
        // CONTEXT INJECTION: Prepend the path to ensure the vector "remembers" its location
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

    if (nodes.length === 0) throw new Error("Hierarchy extraction failed.");

    // Delete existing chunks for this doc
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const BATCH_SIZE = 15;
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
        console.error(`❌ Batch Embedding Fault at node ${i}`);
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
    console.error("❌ [Indexer Fatal]:", error.message);
    throw error;
  }
}
