import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * WORLD-CLASS NEURAL INDEXER (v16.0)
 * Optimized for high-fidelity curriculum grounding and Sindh DCAR standards.
 */
export async function indexCurriculumMarkdown(
  documentId: string,
  content: string,
  supabase: SupabaseClient,
  metadata: any
) {
  console.log(`🧠 [Indexer] Neural Locking Asset: ${documentId}`);

  if (!content || content.length < 50) {
    throw new Error("Neural Index Fail: Content too sparse for meaningful synthesis.");
  }

  // 1. DUAL-STRATEGY CHUNKING
  // Strategy A: Structural Blocks (Units/Standards)
  // Strategy B: Sliding Window (Contextual Fragments)
  
  const blocks = content.split(/(?=^(?:#{1,4}\s+)?(?:Standard:|Unit|Chapter|Section|Domain|Grade|SLO:))/gim);
  const rawChunks: { text: string; sloCodes: string[] }[] = [];

  // Structural Processing
  blocks.forEach((block) => {
    const trimmed = block.trim();
    if (trimmed.length < 20) return;

    // Aggressive SLO Extraction (S8.C3, 8.1.2, S8-A-05)
    const sloRegex = /(?:Standard:|SLO)\s*[:\s]*([A-Z0-9\.-]{2,15})/gi;
    const codes = Array.from(trimmed.matchAll(sloRegex))
      .map(m => m[1].trim().toUpperCase())
      .filter(c => c.length >= 2);
    
    const hierarchyRegex = /\b\d+\.\d+(?:\.\d+)?\b/g;
    const hierarchyCodes = trimmed.match(hierarchyRegex) || [];

    rawChunks.push({
      text: trimmed,
      sloCodes: Array.from(new Set([...codes, ...hierarchyCodes]))
    });
  });

  // Fragment Processing (Ensures conceptual continuity)
  const words = content.split(/\s+/);
  const windowSize = 400;
  const overlap = 150;
  
  for (let i = 0; i < words.length; i += (windowSize - overlap)) {
    const fragmentText = words.slice(i, i + windowSize).join(' ');
    if (fragmentText.length < 200) continue;
    
    rawChunks.push({
      text: `[NEURAL_FRAGMENT] ${fragmentText}`,
      sloCodes: ['CONTEXT_NODE']
    });
  }

  console.log(`📡 [Indexer] Syncing ${rawChunks.length} nodes to Vector Plane...`);

  // 2. BATCH VECTOR SYNTHESIS
  const embeddings = await generateEmbeddingsBatch(rawChunks.map(c => c.text));

  // 3. ATOMIC PERSISTENCE
  const insertData = rawChunks.map((c, i) => ({
    document_id: documentId,
    chunk_text: c.text,
    embedding: embeddings[i],
    slo_codes: c.sloCodes,
    metadata: { 
      board: metadata.board || 'Sindh',
      subject: metadata.subject || 'General',
      grade: metadata.grade || 'Auto',
      processed_at: new Date().toISOString() 
    },
    chunk_index: i
  }));

  // Clean-wipe existing nodes for this asset before fresh sync
  await supabase.from('document_chunks').delete().eq('document_id', documentId);
  
  const { error } = await supabase.from('document_chunks').insert(insertData);
  if (error) throw error;

  return rawChunks.length;
}

export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string | undefined,
  supabase: SupabaseClient
) {
  const boardMatch = content.match(/Board:\s*([^\n\r]+)/i);
  const subjectMatch = content.match(/Subject:\s*([^\n\r]+)/i);
  const gradeMatch = content.match(/Grade:\s*([^\n\r]+)/i);

  return indexCurriculumMarkdown(documentId, content, supabase, { 
    filePath,
    board: boardMatch?.[1]?.trim(),
    subject: subjectMatch?.[1]?.trim(),
    grade: gradeMatch?.[1]?.trim()
  });
}