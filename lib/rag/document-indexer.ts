import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * WORLD-CLASS NEURAL INDEXER (v18.0)
 * Single authoritative source for high-fidelity curriculum extraction.
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

  const rawChunks: { text: string; sloCodes: string[] }[] = [];

  // 1. STRUCTURAL SPLITTING (Standards Grid)
  const blocks = content.split(/(?=^(?:#{1,4}\s+)?(?:Standard:|Unit|Chapter|Section|Domain|Grade|SLO:))/gim);
  blocks.forEach((block) => {
    const trimmed = block.trim();
    if (trimmed.length < 20) return;

    // Extract precise SLO codes for database tagging
    const sloRegex = /(?:Standard:|SLO)\s*[:\s]*([A-Z0-9\.-]{2,15})/gi;
    const codes = Array.from(trimmed.matchAll(sloRegex))
      .map(m => m[1].trim().toUpperCase())
      .filter(c => c.length >= 2);
    
    rawChunks.push({
      text: trimmed,
      sloCodes: Array.from(new Set(codes))
    });
  });

  // 2. CONCEPTUAL SLIDING WINDOW (Gap-Filler)
  const words = content.split(/\s+/);
  const windowSize = 400;
  const overlap = 150;
  for (let i = 0; i < words.length; i += (windowSize - overlap)) {
    const fragmentText = words.slice(i, i + windowSize).join(' ');
    if (fragmentText.length < 250) continue;
    
    rawChunks.push({
      text: `[CONTEXT_FRAG] ${fragmentText}`,
      sloCodes: ['GLOBAL_CONTEXT']
    });
  }

  console.log(`📡 [Indexer] Syncing ${rawChunks.length} nodes to Vector Plane...`);

  // 3. VECTOR SYNTHESIS & PERSISTENCE
  const embeddings = await generateEmbeddingsBatch(rawChunks.map(c => c.text));

  const insertData = rawChunks.map((c, i) => ({
    document_id: documentId,
    chunk_text: c.text,
    embedding: embeddings[i],
    slo_codes: c.sloCodes,
    metadata: { 
      board: metadata.board || 'General',
      subject: metadata.subject || 'General',
      processed_at: new Date().toISOString()
    },
    chunk_index: i
  }));

  // Clean-wipe existing nodes for this asset
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