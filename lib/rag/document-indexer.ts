import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

/**
 * ATOMIC PEDAGOGICAL INDEXER (v210.0)
 * Logic: Respects the hierarchical structure of Master MD.
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
    
    let currentGrade = "N/A";
    let currentDomain = "General";
    let currentStandard = "N/A";
    let currentBenchmark = "N/A";
    
    const pedagogicalChunks: any[] = [];
    let currentBuffer = "";
    let accumulatedSLOs: string[] = [];

    // Protocol: Iterate and detect hierarchical markers
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Detect Hierarchy for Context Injection
      if (line.startsWith('# GRADE')) currentGrade = line.replace('# GRADE', '').trim();
      else if (line.startsWith('# ')) currentDomain = line.replace('#', '').trim();
      else if (line.startsWith('## ')) currentStandard = line.replace('##', '').trim();
      else if (line.startsWith('### ')) currentBenchmark = line.replace('###', '').trim();

      const lineCodes = extractSLOCodes(line);
      lineCodes.forEach(code => {
        if (!accumulatedSLOs.includes(code)) accumulatedSLOs.push(code);
      });

      currentBuffer += (currentBuffer ? '\n' : '') + line;

      // CHUNK TRIGGER: We break at the start of new hierarchy nodes OR if buffer is large
      const isNewSection = line.startsWith('#') || line.startsWith('Standard:') || line.startsWith('Benchmark:');
      const isLargeBuffer = currentBuffer.length >= 1800;

      if ((isNewSection && currentBuffer.length > 500) || isLargeBuffer || i === lines.length - 1) {
        // INJECT CONTEXT HEADER: Every chunk becomes a self-contained pedagogical node
        const contextHeader = `[CONTEXT: Grade ${currentGrade} | Domain: ${currentDomain} | Standard: ${currentStandard}]\n`;
        const finalChunkText = contextHeader + currentBuffer.trim();

        pedagogicalChunks.push({
          text: finalChunkText,
          metadata: {
            grade: currentGrade,
            domain: currentDomain,
            standard: currentStandard,
            benchmark: currentBenchmark,
            slo_codes: [...accumulatedSLOs],
            dialect: meta.dialect || 'Standard'
          }
        });

        currentBuffer = "";
        accumulatedSLOs = [];
      }
    }

    // Database Sync Protocol
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const BATCH_SIZE = 12;
    for (let i = 0; i < pedagogicalChunks.length; i += BATCH_SIZE) {
      const batch = pedagogicalChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
      
      const records = batch.map((chunk, j) => {
        const embedding = embeddings[j];
        if (!embedding || embedding.length !== 768) return null;

        return {
          document_id: documentId,
          chunk_text: chunk.text,
          embedding: embedding,
          slo_codes: chunk.metadata.slo_codes,
          metadata: chunk.metadata,
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
      chunk_count: pedagogicalChunks.length
    }).eq('id', documentId);

    return { success: true, count: pedagogicalChunks.length };
  } catch (error) {
    console.error("❌ [Indexer Fault]:", error);
    throw error;
  }
}