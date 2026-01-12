
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../supabase';
import { chunkDocument } from './chunking-strategy';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * AGGRESSIVE SANITATION
 * Removes null bytes (\u0000) and hidden control characters that crash 
 * the PostgreSQL JSON/Vector input parsers during bulk ingestion.
 */
function deepSanitize(text: string): string {
  if (!text) return "";
  return text
    .replace(/\u0000/g, '') // Remove null bytes (critical for PDF extracts)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // Control characters
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '') // Invalid Unicode
    .trim();
}

/**
 * NEURAL SYNCHRONIZER
 * Maps curriculum text to the high-dimensional vector grid.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string | null,
  r2Key: string | null,
  supabase: SupabaseClient = defaultSupabase
): Promise<void> {
  console.log(`\n🧠 [Neural Sync] Initializing for document: ${documentId}`);
  
  try {
    let rawText = content || "";
    
    if (!rawText) {
      const { data: doc } = await supabase
        .from('documents')
        .select('extracted_text')
        .eq('id', documentId)
        .single();
      rawText = doc?.extracted_text || "";
    }

    const documentText = deepSanitize(rawText);

    if (documentText.length < 10) {
      throw new Error('Neural Sync Failed: Document contains no extractable text.');
    }
    
    // 1. Generate Logical Segments
    const chunks = chunkDocument(documentText);
    console.log(`✅ [Indexer] ${chunks.length} pedagogical units generated.`);
    
    // 2. Optimized Vector Synthesis
    console.log(`✨ [Indexer] Synthesizing high-density vectors...`);
    const chunkTexts = chunks.map(c => deepSanitize(c.text));
    const embeddings = await generateEmbeddingsBatch(chunkTexts);
    console.log(`✅ [Indexer] ${embeddings.length} semantic embeddings ready.`);

    // 3. Grid Persistence
    // Wipe stale vector nodes
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const insertData = chunks.map((chunk, idx) => ({
      document_id: documentId,
      chunk_text: deepSanitize(chunk.text),
      chunk_index: chunk.index,
      chunk_type: chunk.type,
      slo_codes: (chunk.sloMentioned || []).map(s => deepSanitize(s)).filter(Boolean),
      keywords: (chunk.keywords || []).map(k => deepSanitize(k)).filter(Boolean),
      embedding: embeddings[idx] // Passed as native JS array
    }));
    
    // Insert in chunks to avoid request body size limits in Supabase gateway
    const dbBatchSize = 10;
    for (let i = 0; i < insertData.length; i += dbBatchSize) {
      const batch = insertData.slice(i, i + dbBatchSize);
      const { error: insertError } = await supabase
        .from('document_chunks')
        .insert(batch);
      
      if (insertError) {
        console.error(`[Indexer DB Batch Error]:`, insertError);
        throw new Error(`Database Node Error: ${insertError.message}`);
      }
    }
    
    // 4. Finalize Global Status
    await supabase.from('documents').update({
      status: 'ready',
      rag_indexed: true,
      rag_indexed_at: new Date().toISOString(),
      chunk_count: chunks.length,
    }).eq('id', documentId);
    
    console.log(`🏁 [Neural Sync] Document synchronized with vector grid.`);
    
  } catch (error: any) {
    console.error(`❌ [Neural Sync Fatal]:`, error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw error;
  }
}
