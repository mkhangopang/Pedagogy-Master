import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

/**
 * NEURAL VECTOR INDEXER (v200.0)
 * Feature: Recursive Header Injection for Context Locking.
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
    
    // 1. Process Hierarchy
    const lines = content.split('\n');
    let currentDomain = "";
    let currentStandard = "";
    let currentBenchmark = "";
    
    const processedChunks: any[] = [];
    let currentChunkText = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect Hierarchy Headers
      if (trimmed.startsWith('# ')) currentDomain = trimmed.replace('# ', '');
      else if (trimmed.startsWith('## ')) currentStandard = trimmed.replace('## ', '');
      else if (trimmed.startsWith('### ')) currentBenchmark = trimmed.replace('### ', '');
      
      // Detect Atomic SLOs
      if (trimmed.startsWith('- SLO:')) {
        const codes = extractSLOCodes(trimmed);
        
        // RECURSIVE CONTEXT INJECTION
        // We prepend the hierarchy to the chunk text for better RAG grounding
        const enrichedText = `CONTEXT: ${currentDomain} > ${currentStandard} > ${currentBenchmark}\n${trimmed}`;
        
        processedChunks.push({
          text: enrichedText,
          metadata: {
            subject: meta.subject,
            grade: meta.grade,
            slo_codes: codes,
            source_path: filePath,
            hierarchy: { domain: currentDomain, standard: currentStandard, benchmark: currentBenchmark },
            is_atomic_slo: true
          }
        });
      }
    }

    // 2. Clear Existing Node Points
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. Parallel Batch Embedding (v4.0 Optimized)
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
      last_synced_at: new Date().toISOString()
    }).eq('id', documentId);

    return { success: true, count: processedChunks.length };
  } catch (error: any) {
    console.error("❌ [Indexer Context Fault]:", error);
    throw error;
  }
}