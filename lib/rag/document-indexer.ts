
import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

/**
 * HIGH-FIDELITY PEDAGOGICAL INDEXER (v230.0)
 * Logic: Continuum-Aware Hierarchical Mapping.
 * Implements Super Prompt Protocol 3: Context Prepending.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  try {
    const meta = preExtractedMeta || {};
    const lines = content.split('\n');
    
    // Hierarchy State Tracking
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

      // 🏛️ HIERARCHY DETECTION
      if (line.startsWith('# GRADE')) {
        currentGrade = line.replace('# GRADE', '').trim();
      } else if (line.startsWith('## DOMAIN')) {
        currentDomain = line.replace('## DOMAIN', '').trim();
      } else if (line.startsWith('**Standard:**')) {
        currentStandard = line.replace('**Standard:**', '').trim();
      } else if (line.startsWith('**Benchmark')) {
        currentBenchmark = line.match(/Benchmark\s*([IVXLCDM\d]+)/i)?.[1] || "I";
      }

      // Extract SLO codes for chunk metadata
      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => { 
        if (!codesInChunk.includes(c.code)) codesInChunk.push(c.code); 
      });

      buffer += (buffer ? '\n' : '') + line;

      // CHUNK TRIGGER (Sliding window of ~1100 chars)
      if (buffer.length >= 1100 || i === lines.length - 1) {
        // ENFORCEMENT: Protocol 3 - Context Prepending [CTX: ...]
        const ctxHeader = `[CTX: Grade=${currentGrade} | Domain=${currentDomain} | Standard=${currentStandard} | Benchmark=${currentBenchmark}]\n`;
        const enrichedText = ctxHeader + buffer.trim();

        nodes.push({
          text: enrichedText,
          metadata: {
            grade: currentGrade,
            domain: currentDomain,
            standard: currentStandard,
            benchmark: currentBenchmark,
            slo_codes: [...codesInChunk],
            dialect: meta.dialect || 'Standard'
          }
        });

        buffer = "";
        codesInChunk = [];
      }
    }

    // Grid Purge & Sync
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const BATCH_SIZE = 10;
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(n => n.text));
      
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
        const { error } = await supabase.from('document_chunks').insert(records);
        if (error) throw error;
      }
    }

    await supabase.from('documents').update({ 
      status: 'ready',
      rag_indexed: true,
      chunk_count: nodes.length
    }).eq('id', documentId);

    return { success: true, count: nodes.length };
  } catch (error) {
    console.error("❌ [Indexer Error]:", error);
    throw error;
  }
}
