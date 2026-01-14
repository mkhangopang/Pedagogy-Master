
import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * INSTITUTIONAL CURRICULUM INDEXER (v6.0)
 * Rules:
 * 1. Embed ONLY validated Markdown content.
 * 2. Chunk strictly by 'Learning Outcome' or 'Standard'.
 * 3. Attach rich pedagogical metadata for precise RAG.
 */
export async function indexCurriculumMarkdown(
  documentId: string,
  content: string,
  supabase: SupabaseClient,
  metadata: any
) {
  console.log(`🧠 [Indexer] Initiating curriculum locking for doc: ${documentId}`);

  // 1. Structural Slicing
  // We slice by Standards (### Standard:) to ensure each chunk represents a single pedagogical atomic unit.
  const standards = content.split('### Standard:');
  const chunks: { text: string; metadata: any }[] = [];

  // Skip the first split as it's typically metadata/headers
  standards.slice(1).forEach(block => {
    const lines = block.trim().split('\n');
    const standardId = lines[0].trim();
    const standardText = block.trim();

    // Extract parent Unit info by searching backwards if necessary
    // (In a production app, we'd use a more robust parser, but this fits the MD structure)
    
    chunks.push({
      text: `### Standard: ${standardText}`,
      metadata: {
        document_id: documentId,
        standard_id: standardId,
        board: metadata.board,
        grade: metadata.gradeLevel || metadata.grade,
        subject: metadata.subject,
        source_type: 'markdown',
        curriculum_id: documentId // Use doc ID as unique curriculum identifier
      }
    });
  });

  if (chunks.length === 0) {
    throw new Error("Institutional Error: No Standards identified in Markdown. Please ensure standards start with '### Standard: [ID]'.");
  }

  console.log(`📡 [Indexer] Syncing ${chunks.length} curriculum standards to vector plane...`);

  // 2. Vector Synthesis
  const embeddings = await generateEmbeddingsBatch(chunks.map(c => c.text));

  // 3. PostgreSQL Persistence
  const insertData = chunks.map((c, i) => ({
    document_id: c.metadata.document_id,
    chunk_text: c.text,
    embedding: embeddings[i],
    slo_codes: [c.metadata.standard_id], // Map standard ID to searchable SLO array
    metadata: c.metadata
  }));

  // Clean previous indices for this document
  await supabase.from('document_chunks').delete().eq('document_id', documentId);
  
  // Batch insert new curriculum nodes
  const { error } = await supabase.from('document_chunks').insert(insertData);
  if (error) throw error;

  return chunks.length;
}

/**
 * Unified indexing wrapper used across administrative and reindexing tasks.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string | undefined,
  supabase: SupabaseClient
) {
  // Pass filePath into metadata for consistent RAG context
  return indexCurriculumMarkdown(documentId, content, supabase, { filePath });
}
