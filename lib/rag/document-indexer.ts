import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

/**
 * PEDAGOGICAL METADATA EXTRACTOR (v37.0)
 * Scans content for Grade and Topic alignment with high priority.
 */
function extractPedagogicalMetadata(text: string, sloCodes: string[], unitName: string) {
  const grades = new Set<string>();
  
  // 1. Direct Grade Mention Scan (e.g., "Grade VIII", "Grade 8", "Class 4")
  const gradeKeywords = text.match(/(?:Grade|Class|Level)\s*(IV|V|VI|VII|VIII|IX|X|\d{1,2})/gi);
  if (gradeKeywords) {
    gradeKeywords.forEach(gk => {
      const val = gk.replace(/(?:Grade|Class|Level)\s*/i, '').toUpperCase();
      const romanMap: any = { 'IV': '4', 'V': '5', 'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10' };
      if (romanMap[val]) grades.add(romanMap[val]);
      else if (!isNaN(parseInt(val))) grades.add(parseInt(val).toString());
    });
  }

  // 2. Inheritance from SLO codes
  sloCodes.forEach(code => {
    const match = code.match(/[A-Z](\d{2})/i); 
    if (match) grades.add(parseInt(match[1], 10).toString());
  });

  // 3. Inheritance from Unit Name (Critical for context blocks)
  const unitGradeMatch = unitName.match(/(?:Grade|Class|Level)\s*(IV|V|VI|VII|VIII|IX|X|\d{1,2})/i);
  if (unitGradeMatch) {
    const val = unitGradeMatch[1].toUpperCase();
    const romanMap: any = { 'IV': '4', 'V': '5', 'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10' };
    if (romanMap[val]) grades.add(romanMap[val]);
    else if (!isNaN(parseInt(val))) grades.add(parseInt(val).toString());
  }
  
  const commonTopics = [
    'photosynthesis', 'energy', 'force', 'cells', 'ecosystem', 'matter', 
    'water cycle', 'weather', 'space', 'electricity', 'human body', 
    'plants', 'animals', 'chemistry', 'physics', 'biology', 'gravity',
    'natural resources', 'environment', 'solids', 'liquids', 'gases', 'dna', 
    'magnetism', 'electromagnet', 'pollution', 'water', 'acid', 'base'
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

  return {
    grade_levels: Array.from(grades),
    topics: topics,
    bloom_levels: detectedBloom,
    difficulty: detectedBloom.includes('Create') ? 'High' : 'Medium',
    unit_name: unitName
  };
}

/**
 * WORLD-CLASS NEURAL INDEXER (v37.0)
 * Optimized for multi-segmented Pakistani SLO formats and Grade isolation.
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
    console.log(`📡 [Indexer] Ingesting Node: ${documentId}...`);
    
    await supabase.from('documents').update({ 
      status: 'processing', 
      rag_indexed: false 
    }).eq('id', documentId);

    const processedChunks: { text: string; sloCodes: string[]; metadata: any }[] = [];
    let currentUnitName = "General Context";

    // Split by logical sections: Units or Domain headers
    const blocks = content.split(/(?=^(?:#{1,4}\s+)?(?:Standard:|Unit|Chapter|Section|Domain|Grade|SLO:))/gim);
    
    blocks.forEach((block, index) => {
      let trimmed = block.trim();
      if (trimmed.length < 15) return;

      const unitMatch = trimmed.match(/^(?:#{1,4}\s+)?(?:Unit|Chapter|Section|Module|Domain|Grade)\s*[:\s]*([^:\n]+)/im);
      if (unitMatch) currentUnitName = unitMatch[0].trim();

      if (trimmed.length > 2500) {
        const subblocks = trimmed.match(/.{1,2000}(\s|$)/g) || [trimmed];
        subblocks.forEach((sb, si) => {
           processedChunks.push(processBlock(sb, index + si, currentUnitName));
        });
      } else {
        processedChunks.push(processBlock(trimmed, index, currentUnitName));
      }
    });

    function processBlock(text: string, index: number, unitName: string) {
      // Find all variants of SLO codes in the text block
      const sloRegex = /(?:SLO|Outcome|Objective)\s*[:\s]*([A-Z0-9\.-]{3,15})/gi;
      const codesSet = new Set<string>();
      
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
          section_title: titleMatch ? titleMatch[1].substring(0, 100).trim() : unitName,
          chunk_index: index,
          timestamp: new Date().toISOString()
        }
      };
    }

    // Fallback if no structured blocks detected
    if (processedChunks.length === 0) {
       const words = content.split(/\s+/);
       for (let i = 0; i < words.length; i += 300) {
         const slice = words.slice(i, i + 500).join(' ');
         if (slice.length > 100) {
           processedChunks.push({ 
             text: slice, 
             sloCodes: [], 
             metadata: { ...extractPedagogicalMetadata(slice, [], "Fallback"), section_title: "General Section", chunk_index: processedChunks.length } 
           });
         }
       }
    }

    // Batch insertion for performance
    const BATCH_SIZE = 20;
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
    }

    await supabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', documentId);
    return { success: true, chunkCount: processedChunks.length };

  } catch (error: any) {
    console.error("❌ [Indexer] Neural Fail:", error);
    await supabase.from('documents').update({ status: 'failed', rag_indexed: false }).eq('id', documentId);
    throw error;
  }
}