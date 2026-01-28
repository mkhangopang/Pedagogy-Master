import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

/**
 * PEDAGOGICAL METADATA EXTRACTOR (v38.0)
 */
function extractPedagogicalMetadata(text: string, sloCodes: string[], unitName: string) {
  const grades = new Set<string>();
  
  // 1. Grade Recognition from Text & Unit
  const gradeContext = (text + " " + unitName).match(/(?:Grade|Class|Level)\s*(IV|V|VI|VII|VIII|IX|X|\d{1,2})/gi);
  if (gradeContext) {
    gradeContext.forEach(gk => {
      const val = gk.replace(/(?:Grade|Class|Level)\s*/i, '').toUpperCase();
      const romanMap: any = { 'IV': '4', 'V': '5', 'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10' };
      if (romanMap[val]) grades.add(romanMap[val]);
      else if (!isNaN(parseInt(val))) grades.add(parseInt(val).toString());
    });
  }

  // 2. Grade Inference from SLO codes (e.g., S08 -> Grade 8)
  sloCodes.forEach(code => {
    const match = code.match(/[A-Z](\d{2})/i); 
    if (match) grades.add(parseInt(match[1], 10).toString());
  });

  const commonTopics = [
    'stars', 'galaxy', 'universe', 'solar system', 'black hole', 'telescope',
    'photosynthesis', 'energy', 'force', 'cells', 'ecosystem', 'matter', 
    'water cycle', 'electricity', 'human body', 'magnetism', 'pollution'
  ];
  const topics = commonTopics.filter(t => text.toLowerCase().includes(t));

  return {
    grade_levels: Array.from(grades),
    topics: topics,
    unit_name: unitName,
    is_standard_definition: text.includes('SLO:') || text.includes('Objective:')
  };
}

/**
 * WORLD-CLASS NEURAL INDEXER (v38.0)
 * Optimized for Sindh Curriculum Table structures and precise SLO ID tracking.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  try {
    console.log(`📡 [Indexer] Syncing Node: ${documentId}`);
    
    await supabase.from('documents').update({ status: 'processing', rag_indexed: false }).eq('id', documentId);

    const processedChunks: { text: string; sloCodes: string[]; metadata: any }[] = [];
    let currentUnitName = "General Reference";

    // Strategic Splitting: Units or Domain headers
    const blocks = content.split(/(?=^(?:#{1,4}\s+)?(?:Standard:|Unit|Chapter|Section|Domain|Grade|SLO:))/gim);
    
    blocks.forEach((block, index) => {
      let trimmed = block.trim();
      if (trimmed.length < 10) return;

      const unitMatch = trimmed.match(/^(?:#{1,4}\s+)?(?:Unit|Chapter|Module|Domain|Grade)\s*[:\s]*([^:\n]+)/im);
      if (unitMatch) currentUnitName = unitMatch[1].trim();

      // Ensure chunks aren't too small or too large
      if (trimmed.length > 2000) {
        const subblocks = trimmed.match(/.{1,1500}(\s|$)/g) || [trimmed];
        subblocks.forEach((sb, si) => processedChunks.push(processBlock(sb, index + si, currentUnitName)));
      } else {
        processedChunks.push(processBlock(trimmed, index, currentUnitName));
      }
    });

    function processBlock(text: string, index: number, unitName: string) {
      // Find all variants of SLO codes (e.g., S-08-C-03, SLO:S08C03)
      const sloRegex = /(?:SLO|Outcome|Objective)\s*[:\s]*([A-Z0-9\.-]{3,15})/gi;
      const codesSet = new Set<string>();
      
      let match;
      while ((match = sloRegex.exec(text)) !== null) {
        const normalized = normalizeSLO(match[1]);
        if (normalized && normalized.length >= 4) codesSet.add(normalized);
      }
      
      const codes = Array.from(codesSet);
      const meta = extractPedagogicalMetadata(text, codes, unitName);
      
      return { 
        text, 
        sloCodes: codes,
        metadata: { ...meta, chunk_index: index, timestamp: new Date().toISOString() }
      };
    }

    // Insert to DB in batches
    const BATCH_SIZE = 15;
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
        unit_name: chunk.metadata.unit_name
      }));

      if (i === 0) await supabase.from('document_chunks').delete().eq('document_id', documentId);
      const { error } = await supabase.from('document_chunks').insert(chunkRecords);
      if (error) throw error;
    }

    await supabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', documentId);
    return { success: true };
  } catch (error: any) {
    console.error("❌ [Indexer] Fault:", error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw error;
  }
}