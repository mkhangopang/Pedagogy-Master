import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

/**
 * PEDAGOGICAL METADATA EXTRACTOR
 */
function extractPedagogicalMetadata(text: string, sloCodes: string[], unitName: string) {
  const grades = new Set<string>();
  sloCodes.forEach(code => {
    const match = code.match(/S(\d{2})/i); 
    if (match) grades.add(parseInt(match[1], 10).toString());
  });
  
  const commonTopics = [
    'photosynthesis', 'energy', 'force', 'cells', 'ecosystem', 'matter', 
    'water cycle', 'weather', 'space', 'electricity', 'human body', 
    'plants', 'animals', 'chemistry', 'physics', 'biology', 'gravity',
    'natural resources', 'environment', 'solids', 'liquids', 'gases', 'dna'
  ];
  const topics = commonTopics.filter(t => text.toLowerCase().includes(t));

  const bloomVerbs: Record<string, string[]> = {
    'Remember': ['define', 'list', 'state', 'recall', 'identify', 'name'],
    'Understand': ['explain', 'describe', 'summarize', 'interpret', 'classify'],
    'Apply': ['solve', 'apply', 'demonstrate', 'use', 'illustrate'],
    'Analyze': ['analyze', 'compare', 'contrast', 'examine', 'distinguish'],
    'Evaluate': ['evaluate', 'justify', 'critique', 'assess', 'defend'],
    'Create': ['design', 'develop', 'create', 'formulate', 'construct']
  };
  
  const detectedBloom = Object.entries(bloomVerbs)
    .filter(([_, verbs]) => verbs.some(v => new RegExp(`\\b${v}\\b`, 'i').test(text)))
    .map(([level]) => level);

  let difficulty = 'Medium';
  if (detectedBloom.includes('Create') || detectedBloom.includes('Evaluate')) difficulty = 'High';
  else if (detectedBloom.includes('Remember') && detectedBloom.length === 1) difficulty = 'Low';

  return {
    grade_levels: Array.from(grades),
    topics: topics,
    bloom_levels: detectedBloom,
    difficulty,
    unit_name: unitName
  };
}

/**
 * WORLD-CLASS NEURAL INDEXER (v35.0)
 * AUDIT OPTIMIZATION: Implemented Lazy Batch Indexing.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  if (!content || content.length < 50) {
    throw new Error("Content too sparse for neural indexing.");
  }

  try {
    console.log(`📡 [Indexer] Syncing and Normalizing Document ${documentId}...`);
    
    await supabase.from('documents').update({ 
      status: 'processing', 
      rag_indexed: false 
    }).eq('id', documentId);

    const processedChunks: { text: string; sloCodes: string[]; metadata: any }[] = [];
    let currentUnitName = "General Context";

    const blocks = content.split(/(?=^(?:#{1,4}\s+)?(?:Standard:|Unit|Chapter|Section|SLO:))/gim);
    
    blocks.forEach((block, index) => {
      let trimmed = block.trim();
      if (trimmed.length < 20) return;

      const unitMatch = trimmed.match(/^(?:#{1,4}\s+)?(?:Unit|Chapter|Section|Module)\s*[:\s]*([^:\n]+)/im);
      if (unitMatch) currentUnitName = unitMatch[1].trim();

      if (trimmed.length > 3000) {
        const subblocks = trimmed.match(/.{1,2500}(\s|$)/g) || [trimmed];
        subblocks.forEach((sb, si) => {
           processedChunks.push(processBlock(sb, index + si, currentUnitName));
        });
      } else {
        processedChunks.push(processBlock(trimmed, index, currentUnitName));
      }
    });

    function processBlock(text: string, index: number, unitName: string) {
      const headerSloMatch = text.match(/^(?:#{1,4}\s+)?(?:Standard|SLO|Outcome)\s*[:\s]+(?:SLO\s*[:\s]+)?([A-Z0-9\.-]{2,15})/im);
      const sloRegex = /(?:Standard|SLO|Outcome|Objective)\s*[:\s]+(?:SLO\s*[:\s]+)?([A-Z0-9\.-]{2,15})/gi;
      const codesSet = new Set<string>();
      
      if (headerSloMatch) {
        const hNorm = normalizeSLO(headerSloMatch[1]);
        if (hNorm) codesSet.add(hNorm);
      }

      let match;
      while ((match = sloRegex.exec(text)) !== null) {
        const normalized = normalizeSLO(match[1]);
        if (normalized && normalized.length >= 3) {
          codesSet.add(normalized);
        }
      }
      
      const codes = Array.from(codesSet);
      const pedagogicalMeta = extractPedagogicalMetadata(text, codes, unitName);
      const titleMatch = text.match(/^(?:#{1,4}\s+)?(.+)/m);
      
      return { 
        text, 
        sloCodes: codes,
        metadata: {
          ...pedagogicalMeta,
          section_title: titleMatch ? titleMatch[1].substring(0, 50).trim() : "General Context",
          chunk_index: index,
          timestamp: new Date().toISOString()
        }
      };
    }

    if (processedChunks.length === 0) {
       const words = content.split(/\s+/);
       for (let i = 0; i < words.length; i += 300) {
         const slice = words.slice(i, i + 500).join(' ');
         if (slice.length > 100) {
           processedChunks.push({ 
             text: slice, 
             sloCodes: [], 
             metadata: { ...extractPedagogicalMetadata(slice, [], "Sliding Window"), section_title: "Sliding Window", chunk_index: processedChunks.length } 
           });
         }
       }
    }

    // AUDIT IMPLEMENTATION: BATCH LAZY PROCESSING
    // Split into smaller batches to prevent Vercel 10s timeouts
    const BATCH_SIZE = 10;
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map(c => c.text);
      const embeddings = await generateEmbeddingsBatch(texts);

      const chunkRecords = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.sloCodes,
        chunk_index: i + j,
        metadata: chunk.metadata,
        grade_levels: chunk.metadata.grade_levels,
        topics: chunk.metadata.topics,
        unit_name: chunk.metadata.unit_name,
        difficulty: chunk.metadata.difficulty,
        bloom_levels: chunk.metadata.bloom_levels
      }));

      if (i === 0) {
        await supabase.from('document_chunks').delete().eq('document_id', documentId);
      }
      
      const { error: insertError } = await supabase.from('document_chunks').insert(chunkRecords);
      if (insertError) throw insertError;
      
      console.log(`🧩 [Indexer] Batch ${Math.floor(i/BATCH_SIZE) + 1} synced...`);
    }

    await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true 
    }).eq('id', documentId);
    
    console.log(`✅ [Indexer] Full neural sync complete for ${documentId}.`);

    return { success: true, chunkCount: processedChunks.length };

  } catch (error: any) {
    console.error("❌ [Indexer] Fatal Error:", error);
    await supabase.from('documents').update({ status: 'failed', rag_indexed: false }).eq('id', documentId);
    throw error;
  }
}
