
import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * INSTITUTIONAL CURRICULUM INDEXER (v8.0 - ADAPTIVE)
 * Rules:
 * 1. Chunk by 'Standard' headers (Hash optional).
 * 2. Fallback to SLO lines if standards are sparse.
 */
export async function indexCurriculumMarkdown(
  documentId: string,
  content: string,
  supabase: SupabaseClient,
  metadata: any
) {
  console.log(`🧠 [Indexer] Initiating adaptive locking for doc: ${documentId}`);

  // Adaptive splitting on Standard headers (Hash is now optional in indexer too)
  const blocks = content.split(/^(?:#{2,4}\s+)?Standard:/gim);
  const chunks: { text: string; metadata: any }[] = [];

  // Skip lead block (usually metadata)
  blocks.slice(1).forEach((block, i) => {
    const lines = block.trim().split('\n');
    const standardId = lines[0].trim();
    const standardText = block.trim();

    chunks.push({
      text: `### Standard: ${standardText}`,
      metadata: {
        document_id: documentId,
        standard_id: standardId,
        board: metadata.board || 'Institutional',
        grade: metadata.grade || 'Auto',
        subject: metadata.subject || 'General',
        source_type: 'markdown'
      }
    });
  });

  if (chunks.length === 0) {
    // Attempt fallback to SLO-level indexing if no standard blocks exist
    const sloLines = content.split('\n').filter(l => l.trim().startsWith('- SLO:'));
    sloLines.forEach((line, i) => {
      chunks.push({
        text: line,
        metadata: { document_id: documentId, standard_id: `SLO_${i}`, source_type: 'markdown' }
      });
    });
  }

  if (chunks.length === 0) throw new Error("Neural Index Fail: No indexable nodes found.");

  console.log(`📡 [Indexer] Syncing ${chunks.length} adaptive nodes to vector grid...`);

  const embeddings = await generateEmbeddingsBatch(chunks.map(c => c.text));

  const insertData = chunks.map((c, i) => ({
    document_id: c.metadata.document_id,
    chunk_text: c.text,
    embedding: embeddings[i],
    slo_codes: [c.metadata.standard_id || 'GENERAL'],
    metadata: c.metadata,
    chunk_index: i
  }));

  await supabase.from('document_chunks').delete().eq('document_id', documentId);
  const { error } = await supabase.from('document_chunks').insert(insertData);
  if (error) throw error;

  return chunks.length;
}

export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string | undefined,
  supabase: SupabaseClient
) {
  return indexCurriculumMarkdown(documentId, content, supabase, { filePath });
}
