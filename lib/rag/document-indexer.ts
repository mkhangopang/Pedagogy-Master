import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

/**
 * NEURAL VECTOR INDEXER (v205.0 - Production Optimized)
 * Feature: Semantic Chunk Scaling & Recursive Hierarchy Injection.
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
    
    // 1. Process Hierarchy with Grade & Domain Locking
    const lines = content.split('\n');
    let currentDomain = "General";
    let currentStandard = "Standard Curriculum";
    let currentGrade = meta.grade || "Auto";
    
    const rawChunks: string[] = [];
    const processedChunks: any[] = [];
    
    // TARGET: 1500 characters per chunk for pedagogical depth
    let currentBuffer = "";
    const TARGET_CHUNK_SIZE = 1500;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect Hierarchy for Context Injection
      if (trimmed.startsWith('# GRADE ')) {
         currentGrade = trimmed.replace('# GRADE ', '').trim();
      } else if (trimmed.startsWith('# ')) {
         currentDomain = trimmed.replace('# ', '').trim();
      } else if (trimmed.startsWith('## ')) {
         currentStandard = trimmed.replace('## ', '').trim();
      }
      
      currentBuffer += line + "\n";

      // If buffer reaches target size or we hit a new SLO, create a chunk
      if (currentBuffer.length >= TARGET_CHUNK_SIZE || trimmed.startsWith('- SLO:')) {
        const codes = extractSLOCodes(currentBuffer);
        
        // CONTEXT INJECTION: We embed the hierarchy directly into the text for the vector engine
        const enrichedText = `[GRADE: ${currentGrade}] [DOMAIN: ${currentDomain}] [STANDARD: ${currentStandard}]\n${currentBuffer.trim()}`;
        
        processedChunks.push({
          text: enrichedText,
          metadata: {
            subject: meta.subject,
            grade: currentGrade,
            slo_codes: codes,
            source_path: filePath,
            hierarchy: { domain: currentDomain, standard: currentStandard },
            is_atomic_slo: codes.length > 0
          }
        });
        
        currentBuffer = ""; // Reset buffer
      }
    }

    // 2. Refresh Node Points in Database
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. High-Concurrency Batch Embedding (7-Node Safe)
    const BATCH_SIZE = 12; 
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

      const { error: insertError } = await supabase.from('document_chunks').insert(records);
      if (insertError) throw insertError;
    }

    await supabase.from('documents').update({ 
      rag_indexed: true,
      last_synced_at: new Date().toISOString(),
      grade_level: currentGrade === "Auto" ? meta.grade : currentGrade,
      chunk_count: processedChunks.length
    }).eq('id', documentId);

    return { success: true, count: processedChunks.length };
  } catch (error: any) {
    console.error("❌ [Indexer Context Fault]:", error);
    throw error;
  }
}