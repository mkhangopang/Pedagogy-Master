
import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

/**
 * HIGH-FIDELITY PEDAGOGICAL INDEXER (v241.0 - SURGICAL REPAIR)
 * Logic: Continuum-Aware Hierarchical Mapping.
 * Implements Protocol 3: Context Prepending [CTX: ...]
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  try {
    if (!content || content.length < 10) {
      throw new Error("Empty content provided for indexing.");
    }

    const meta = preExtractedMeta || {};
    const lines = content.split('\n');
    
    // Auto-detect dialect from meta-tag if present
    const dialect = content.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || meta.dialect || 'Standard';

    let currentGrade = "N/A";
    let currentDomain = "General";
    let currentStandard = "General";
    let currentBenchmark = "I";
    
    const nodes: any[] = [];
    let buffer = "";
    let codesInChunk: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // DETECT CONTEXTUAL HIERARCHY (Protocol 3 & Unrolled Column)
      if (line.startsWith('# GRADE')) {
        currentGrade = line.replace('# GRADE', '').trim();
      } else if (line.startsWith('## DOMAIN')) {
        currentDomain = line.replace('## DOMAIN', '').trim();
      } else if (line.startsWith('**Standard:**')) {
        currentStandard = line.replace('**Standard:**', '').trim();
      } else if (line.startsWith('**Benchmark')) {
        currentBenchmark = line.match(/Benchmark\s*([IVXLCDM\d]+)/i)?.[1] || "I";
      }

      // EXTRACT SLO CODES FOR METADATA
      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => { 
        const normalized = c.code.replace(/[\s\[\]-]/g, '').toUpperCase();
        if (!codesInChunk.includes(normalized)) codesInChunk.push(normalized); 
      });

      buffer += (buffer ? '\n' : '') + line;

      // CHUNK TRIGGER (1100 chars for optimal reasoning density)
      if (buffer.length >= 1100 || i === lines.length - 1) {
        // ENFORCEMENT: Protocol 3 - Prepend Lineage to every chunk
        const descriptor = `[CTX: Grade=${currentGrade} | Domain=${currentDomain} | Standard=${currentStandard} | Benchmark=${currentBenchmark}]\n`;
        const enrichedText = descriptor + buffer.trim();

        if (buffer.trim().length > 20) { // Safety check to prevent ghost chunks
          nodes.push({
            text: enrichedText,
            metadata: {
              grade: currentGrade,
              domain: currentDomain,
              standard: currentStandard,
              benchmark: currentBenchmark,
              slo_codes: [...codesInChunk],
              dialect: dialect
            }
          });
        }

        buffer = "";
        codesInChunk = [];
      }
    }

    if (nodes.length === 0) throw new Error("Ingestion node produced 0 valid segments. Verify Markdown structure.");

    // Grid Sync Protocol (SQL v110 aware)
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const BATCH_SIZE = 10;
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      
      try {
        const embeddings = await generateEmbeddingsBatch(batch.map(n => n.text));
        
        const records = batch.map((node, j) => {
          const vec = embeddings[j];
          if (!vec || vec.length !== 768) return null;

          let type = 'general';
          let weight = 0.5;
          if (node.metadata.slo_codes.length > 0) {
            type = 'slo';
            weight = 0.9;
          } else if (node.text.toLowerCase().includes('assessment') || node.text.toLowerCase().includes('quiz')) {
            type = 'assessment';
            weight = 0.8;
          }

          return {
            document_id: documentId,
            chunk_text: node.text,
            embedding: vec,
            slo_codes: node.metadata.slo_codes,
            metadata: node.metadata,
            chunk_index: i + j,
            chunk_type: type,
            cognitive_weight: weight
          };
        }).filter(Boolean);

        if (records.length > 0) {
          const { error } = await supabase.from('document_chunks').insert(records);
          if (error) throw error;
        }
      } catch (err) {
        console.error(`❌ Batch Sync Fault [${i}-${i+BATCH_SIZE}]:`, err);
        // Continue with next batch instead of crashing the whole document
      }
    }

    // Final Status Commit
    await supabase.from('documents').update({ 
      status: 'ready',
      rag_indexed: true,
      chunk_count: nodes.length,
      master_md_dialect: dialect,
      pedagogical_alignment: { 
        bloom_weighted: true, 
        grades_detected: currentGrade !== "N/A" ? [currentGrade] : [] 
      }
    }).eq('id', documentId);

    return { success: true, count: nodes.length };
  } catch (error) {
    console.error("❌ [Indexer Error]:", error);
    throw error;
  }
}
