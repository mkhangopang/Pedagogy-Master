import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * WORLD-CLASS NEURAL INDEXER (v24.0)
 * Synchronizes curriculum content with the vector search grid.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  if (!content || content.length < 50) {
    console.warn(`[Indexer] Document ${documentId} content too sparse to index (${content?.length} chars).`);
    throw new Error("Content too sparse for neural indexing.");
  }

  try {
    console.log(`📡 [Indexer] Syncing Document ${documentId}...`);
    
    // 1. Initial State Lock
    await supabase.from('documents').update({ 
      status: 'processing', 
      rag_indexed: false 
    }).eq('id', documentId);

    const rawChunks: { text: string; sloCodes: string[]; metadata: any }[] = [];

    // 2. Structural Splitting Logic (Curriculum Aware)
    // We split by standard markers but also ensure chunks don't get too large
    const blocks = content.split(/(?=^(?:#{1,4}\s+)?(?:Standard:|Unit|Chapter|Section|SLO:))/gim);
    
    blocks.forEach((block, index) => {
      let trimmed = block.trim();
      if (trimmed.length < 20) return;

      // Further split huge blocks if they don't have natural markers
      if (trimmed.length > 3000) {
        const subblocks = trimmed.match(/.{1,2500}(\s|$)/g) || [trimmed];
        subblocks.forEach((sb, si) => {
           rawChunks.push(processBlock(sb, index + si));
        });
      } else {
        rawChunks.push(processBlock(trimmed, index));
      }
    });

    function processBlock(text: string, index: number) {
      // Improved Regex: Anchors to prefixes but captures the actual code pattern
      // Matches Standard: SLO:S-04-A-01 or SLO: S8A5 etc.
      const sloRegex = /(?:Standard|SLO|Outcome|Objective)\s*[:\s]+(?:SLO\s*[:\s]+)?([A-Z0-9\.-]{2,15})/gi;
      const codes: string[] = [];
      let match;
      
      while ((match = sloRegex.exec(text)) !== null) {
        const rawCode = match[1].toUpperCase();
        // CLEANUP: 1. Strip hyphens/dots for search 2. Filter out literals
        const cleaned = rawCode.replace(/[-\.]/g, '');
        if (cleaned && cleaned !== 'SLO' && cleaned !== 'UNIT' && cleaned.length > 1) {
          codes.push(cleaned);
        }
      }
      
      // Try to find a section title
      const titleMatch = text.match(/^(?:#{1,4}\s+)?(.+)/m);
      
      return { 
        text, 
        sloCodes: Array.from(new Set(codes)),
        metadata: {
          section_title: titleMatch ? titleMatch[1].substring(0, 50) : "General Context",
          chunk_index: index,
          timestamp: new Date().toISOString()
        }
      };
    }

    // 3. Contextual Sliding Window (Fallback Coverage)
    if (rawChunks.length <= 1) {
       console.log(`[Indexer] Single-block document detected. Applying sliding window...`);
       const words = content.split(/\s+/);
       for (let i = 0; i < words.length; i += 250) {
         const slice = words.slice(i, i + 400).join(' ');
         if (slice.length > 100) {
           rawChunks.push({ 
             text: slice, 
             sloCodes: [], 
             metadata: { section_title: "Sliding Window Segment", chunk_index: rawChunks.length } 
           });
         }
       }
    }

    console.log(`💎 [Indexer] Generated ${rawChunks.length} nodes for embedding.`);

    // 4. Batch Embedding Synthesis
    const texts = rawChunks.map(c => c.text);
    const embeddings = await generateEmbeddingsBatch(texts);

    // 5. Vector Grid Synchronization
    const chunkRecords = rawChunks.map((chunk, i) => ({
      document_id: documentId,
      chunk_text: chunk.text,
      embedding: embeddings[i],
      slo_codes: chunk.sloCodes,
      chunk_index: i,
      metadata: chunk.metadata
    }));

    // Reset local grid for this asset
    const { error: deleteError } = await supabase.from('document_chunks').delete().eq('document_id', documentId);
    if (deleteError) console.error("[Indexer] Delete failed:", deleteError);
    
    if (chunkRecords.length > 0) {
      const { error: insertError } = await supabase.from('document_chunks').insert(chunkRecords);
      if (insertError) {
        console.error("[Indexer] Insert failed:", insertError);
        throw insertError;
      }
    }

    // 6. Global Commit
    const { error: updateError } = await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true 
    }).eq('id', documentId);
    
    if (updateError) throw updateError;

    console.log(`✅ [Indexer] Synchronized ${chunkRecords.length} nodes successfully.`);

  } catch (error: any) {
    console.error("❌ [Indexer] Fatal Error:", error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw error;
  }
}