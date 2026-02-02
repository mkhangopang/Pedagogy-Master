
import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

/**
 * NEURAL VECTOR INDEXER (v206.2 - Production Optimized)
 * Feature: Semantic Chunk Scaling & Recursive Hierarchy Injection.
 * FIX: Resolved NOT NULL constraint violation for "chunk_index".
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
    let currentDomain = "General";
    let currentStandard = "Standard Curriculum";
    let currentGrade = meta.grade || "Auto";
    
    const processedChunks: any[] = [];
    
    // TARGET: 1500 characters per chunk for pedagogical depth
    let currentBuffer = "";
    const TARGET_CHUNK_SIZE = 1500;
    const MIN_CHUNK_SIZE = 800;
    let accumulatedSLOs: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
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
      
      const lineCodes = extractSLOCodes(line);
      lineCodes.forEach(code => {
        if (!accumulatedSLOs.includes(code)) accumulatedSLOs.push(code);
      });

      currentBuffer += (currentBuffer ? '\n' : '') + line;

      const isMajorHeading = trimmed.startsWith('# ') || trimmed.startsWith('## ');
      const isLastLine = i === lines.length - 1;

      if (currentBuffer.length >= TARGET_CHUNK_SIZE || (isMajorHeading && currentBuffer.length >= MIN_CHUNK_SIZE) || isLastLine) {
        if (currentBuffer.trim().length > 50) {
          const enrichedText = `[GRADE: ${currentGrade}] [DOMAIN: ${currentDomain}] [STANDARD: ${currentStandard}]\n${currentBuffer.trim()}`;
          
          processedChunks.push({
            text: enrichedText,
            metadata: {
              subject: meta.subject,
              grade: currentGrade,
              slo_codes: [...accumulatedSLOs],
              source_path: filePath,
              hierarchy: { domain: currentDomain, standard: currentStandard },
              is_atomic_slo: accumulatedSLOs.length > 0
            }
          });
        }
        
        currentBuffer = ""; 
        accumulatedSLOs = [];
      }
    }

    // 2. Refresh Node Points in Database
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. High-Concurrency Batch Embedding
    const BATCH_SIZE = 10; // Slightly smaller batch for better stability on free tier
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
      
      const records = batch.map((chunk, j) => {
        const embedding = embeddings[j];
        
        // Defensive check: Ensure embedding is a flat array of numbers
        if (!Array.isArray(embedding) || typeof embedding[0] !== 'number') {
          console.error(`[Indexer] Invalid embedding format detected at batch ${i} index ${j}`);
          return null;
        }

        return {
          document_id: documentId,
          chunk_text: chunk.text,
          embedding: embedding,
          slo_codes: chunk.metadata.slo_codes || [],
          metadata: chunk.metadata,
          chunk_index: i + j // CRITICAL FIX: Explicitly set chunk_index to satisfy DB schema
        };
      }).filter(Boolean);

      if (records && records.length > 0) {
        const { error: insertError } = await supabase.from('document_chunks').insert(records);
        if (insertError) {
          console.error("❌ [Vector Insert Fault]:", insertError.message);
          throw new Error(`Database rejected vector node: ${insertError.message}`);
        }
      }
    }

    await supabase.from('documents').update({ 
      rag_indexed: true,
      last_synced_at: new Date().toISOString(),
      grade_level: currentGrade === "Auto" ? meta.grade : currentGrade,
      chunk_count: processedChunks.length,
      status: 'ready'
    }).eq('id', documentId);

    return { success: true, count: processedChunks.length };
  } catch (error: any) {
    console.error("❌ [Indexer Context Fault]:", error);
    throw error;
  }
}
