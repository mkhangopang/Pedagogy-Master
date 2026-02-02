import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

/**
 * NEURAL VECTOR INDEXER (v201.0)
 * Feature: Grade-Aware Recursive Header Injection.
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
    
    // 1. Process Hierarchy with Grade Detection
    const lines = content.split('\n');
    let currentDomain = "General";
    let currentStandard = "Standard Curriculum";
    let currentBenchmark = "Benchmark Not Set";
    let currentGrade = meta.grade || "Auto";
    
    const processedChunks: any[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Hierarchy Detection
      if (trimmed.startsWith('# GRADE ')) {
         currentGrade = trimmed.replace('# GRADE ', '').trim();
      } else if (trimmed.startsWith('# ')) {
         currentDomain = trimmed.replace('# ', '').trim();
      } else if (trimmed.startsWith('## ')) {
         currentStandard = trimmed.replace('## ', '').trim();
      } else if (trimmed.startsWith('### ')) {
         currentBenchmark = trimmed.replace('### ', '').trim();
      }
      
      // Atomic SLO Processing
      if (trimmed.startsWith('- SLO:')) {
        const codes = extractSLOCodes(trimmed);
        
        // RECURSIVE CONTEXT INJECTION v2
        // We inject Grade, Domain, and Standard directly into the text node for maximum vector retrieval relevance
        const enrichedText = `[GRADE: ${currentGrade}] [DOMAIN: ${currentDomain}] [STANDARD: ${currentStandard}]\nOBJECTIVE: ${trimmed}`;
        
        processedChunks.push({
          text: enrichedText,
          metadata: {
            subject: meta.subject,
            grade: currentGrade,
            slo_codes: codes,
            source_path: filePath,
            hierarchy: { domain: currentDomain, standard: currentStandard, benchmark: currentBenchmark },
            is_atomic_slo: true
          }
        });
      }
    }

    // 2. Refresh Node Points
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. High-Concurrency Embedding Pipeline
    const BATCH_SIZE = 15; 
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
      
      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.metadata.slo_codes || [],
        metadata: chunk.metadata
      }));

      await supabase.from('document_chunks').insert(records);
    }

    await supabase.from('documents').update({ 
      rag_indexed: true,
      last_synced_at: new Date().toISOString(),
      grade_level: currentGrade === "Auto" ? meta.grade : currentGrade
    }).eq('id', documentId);

    return { success: true, count: processedChunks.length };
  } catch (error: any) {
    console.error("❌ [Indexer Context Fault]:", error);
    throw error;
  }
}