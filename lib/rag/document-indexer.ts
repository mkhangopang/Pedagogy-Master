import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * INSTITUTIONAL CURRICULUM INDEXER (v9.0 - SMART SLO DETECTION)
 * Rules:
 * 1. Parse 'Standard:' blocks for specific IDs.
 * 2. Scan content for '- SLO: [CODE]' patterns to tag chunks.
 */
export async function indexCurriculumMarkdown(
  documentId: string,
  content: string,
  supabase: SupabaseClient,
  metadata: any
) {
  console.log(`🧠 [Indexer] Initiating neural locking for doc: ${documentId}`);

  // 1. SPLIT INTO PEDAGOGICAL BLOCKS
  // We split by 'Standard:' headers but keep the headers in the text
  const blocks = content.split(/(?=^(?:#{2,4}\s+)?Standard:)/gim);
  const chunks: { text: string; sloCodes: string[]; metadata: any }[] = [];

  blocks.forEach((block, i) => {
    const trimmedBlock = block.trim();
    if (!trimmedBlock || trimmedBlock.length < 20) return;

    // Extract Standard ID if present (e.g. Standard: S8A5)
    const standardMatch = trimmedBlock.match(/Standard:\s*([^\n\r]+)/i);
    const standardId = standardMatch ? standardMatch[1].trim().toUpperCase() : null;

    // Scan block for internal SLO codes (e.g. - SLO:S8A5)
    const sloRegex = /- SLO\s*[:\s]*([^:\s]+)/gi;
    const internalCodes = Array.from(trimmedBlock.matchAll(sloRegex)).map(m => m[1].trim().toUpperCase());
    
    const sloCodes = Array.from(new Set([
      ...(standardId ? [standardId] : []),
      ...internalCodes
    ])).filter(c => c.length > 2);

    chunks.push({
      text: trimmedBlock,
      sloCodes: sloCodes.length > 0 ? sloCodes : ['GENERAL'],
      metadata: {
        document_id: documentId,
        block_index: i,
        board: metadata.board || 'Institutional',
        grade: metadata.grade || 'Auto',
        subject: metadata.subject || 'General'
      }
    });
  });

  // Fallback: If no blocks identified, chunk by SLO lines
  if (chunks.length === 0) {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (line.trim().startsWith('- SLO:')) {
        const codeMatch = line.match(/- SLO\s*[:\s]*([^:\s]+)/i);
        const code = codeMatch ? codeMatch[1].trim().toUpperCase() : `SLO_${i}`;
        chunks.push({
          text: line,
          sloCodes: [code],
          metadata: { document_id: documentId, line_index: i }
        });
      }
    });
  }

  if (chunks.length === 0) throw new Error("Neural Index Fail: No standard blocks or SLO nodes detected.");

  console.log(`📡 [Indexer] Syncing ${chunks.length} smart nodes to vector grid...`);

  // 2. BATCH EMBEDDING SYNTHESIS
  const embeddings = await generateEmbeddingsBatch(chunks.map(c => c.text));

  // 3. PERSISTENCE
  const insertData = chunks.map((c, i) => ({
    document_id: documentId,
    chunk_text: c.text,
    embedding: embeddings[i],
    slo_codes: c.sloCodes,
    metadata: c.metadata,
    chunk_index: i
  }));

  // Clear existing nodes for this doc before fresh sync
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
  // Use metadata defaults if not provided
  return indexCurriculumMarkdown(documentId, content, supabase, { filePath });
}