import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../supabase';
import { chunkDocument } from './chunking-strategy';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * SANITIZE TEXT
 * Removes null bytes (\u0000) and other non-printable Unicode characters
 * that cause PostgreSQL to fail with "unsupported Unicode escape sequence".
 */
function sanitizeText(text: string): string {
  if (!text) return "";
  // 1. Remove null bytes (\u0000)
  // 2. Remove replacement characters and common invalid Unicode sequences
  return text
    .replace(/\u0000/g, '')
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
    .trim();
}

/**
 * ONE-TIME NEURAL INDEXER
 * Orchestrates the persistent storage of curriculum assets. 
 * Text is chunked, embedded, and stored in the vector grid.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string | null,
  r2Key: string | null,
  supabase: SupabaseClient = defaultSupabase
): Promise<void> {
  console.log(`\n🧠 [Neural Sync] Initializing persistent indexing for: ${documentId}`);
  
  try {
    let rawText = content || "";
    
    // Fetch text from DB if not provided (needed for re-syncing legacy docs)
    if (!rawText) {
      const { data: doc } = await supabase
        .from('documents')
        .select('extracted_text')
        .eq('id', documentId)
        .single();
      rawText = doc?.extracted_text || "";
    }

    // SANITIZATION: Clean the entire document text before processing
    const documentText = sanitizeText(rawText);

    if (!documentText || documentText.length < 20) {
      throw new Error('Insufficient or corrupt curriculum text discovered for indexing.');
    }
    
    // 1. Structural Chunking Strategy
    const chunks = chunkDocument(documentText);
    console.log(`✅ [Indexer] ${chunks.length} pedagogical segments generated.`);
    
    // 2. Neural Vector Generation (One-time cost)
    console.log(`✨ [Indexer] Generating semantic embeddings...`);
    const chunkTexts = chunks.map(c => sanitizeText(c.text));
    const embeddings = await generateEmbeddingsBatch(chunkTexts);
    console.log(`✅ [Indexer] Neural vectors synthesized.`);

    // 3. Persistent Transaction: Clear old and insert new
    // This ensures re-indexing doesn't lead to duplicate context
    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    const insertData = chunks.map((chunk, idx) => ({
      document_id: documentId,
      chunk_text: sanitizeText(chunk.text), // Final sanitization check
      chunk_index: chunk.index,
      chunk_type: chunk.type,
      slo_codes: chunk.sloMentioned,
      keywords: chunk.keywords,
      embedding: embeddings[idx] // The persistent vector
    }));
    
    // Batch insertion to respect Postgres limits
    const dbBatchSize = 10; // Smaller batch size for better reliability
    for (let i = 0; i < insertData.length; i += dbBatchSize) {
      const batch = insertData.slice(i, i + dbBatchSize);
      const { error: insertError } = await supabase
        .from('document_chunks')
        .insert(batch);
      
      if (insertError) {
        console.error(`[Indexer DB Insert Error]:`, insertError);
        throw new Error(`Database rejected segments: ${insertError.message}`);
      }
    }
    
    // 4. Update Document Metadata Status
    await supabase
      .from('documents')
      .update({
        status: 'ready',
        rag_indexed: true,
        rag_indexed_at: new Date().toISOString(),
        chunk_count: chunks.length,
      })
      .eq('id', documentId);
    
    console.log(`🏁 [Neural Sync] Persistent indexing complete.`);
    
  } catch (error: any) {
    console.error(`❌ [Neural Sync] Fatal error:`, error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw error;
  }
}