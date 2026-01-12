
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../supabase';
import { chunkDocument } from './chunking-strategy';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * SANITIZE TEXT
 * Aggressively removes null bytes, control characters, and invalid unicode
 * that can cause PostgreSQL JSON parsing errors.
 */
function sanitizeText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\u0000/g, '') // Null bytes
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // Control characters
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '') // Invalid Unicode
    .trim();
}

/**
 * ONE-TIME NEURAL INDEXER
 * Orchestrates document chunking, semantic embedding, and persistent storage.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string | null,
  r2Key: string | null,
  supabase: SupabaseClient = defaultSupabase
): Promise<void> {
  console.log(`\n🧠 [Neural Sync] Initializing indexing for: ${documentId}`);
  
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

    const documentText = sanitizeText(rawText);

    if (!documentText || documentText.length < 10) {
      throw new Error('Insufficient curriculum text found for indexing.');
    }
    
    // 1. Generate Pedagogical Chunks
    const chunks = chunkDocument(documentText);
    console.log(`✅ [Indexer] ${chunks.length} segments generated.`);
    
    // 2. Synthesize Vectors
    console.log(`✨ [Indexer] Synthesizing semantic vectors in parallel...`);
    const chunkTexts = chunks.map(c => sanitizeText(c.text));
    const embeddings = await generateEmbeddingsBatch(chunkTexts);
    console.log(`✅ [Indexer] ${embeddings.length} vectors ready.`);

    // 3. Persistent Database Update
    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    const insertData = chunks.map((chunk, idx) => ({
      document_id: documentId,
      chunk_text: sanitizeText(chunk.text),
      chunk_index: chunk.index,
      chunk_type: chunk.type,
      slo_codes: (chunk.sloMentioned || []).map(s => sanitizeText(s)).filter(Boolean),
      keywords: (chunk.keywords || []).map(k => sanitizeText(k)).filter(Boolean),
      // Use string format for vector to avoid JSON parsing issues with large arrays
      embedding: `[${embeddings[idx].join(',')}]`
    }));
    
    // Bulk insertion in small batches to stay within PostgREST limits
    const dbBatchSize = 15;
    for (let i = 0; i < insertData.length; i += dbBatchSize) {
      const batch = insertData.slice(i, i + dbBatchSize);
      const { error: insertError } = await supabase
        .from('document_chunks')
        .insert(batch);
      
      if (insertError) {
        console.error(`[Indexer DB Error at ${i}]:`, insertError);
        throw new Error(`Database rejected segments: ${insertError.message}`);
      }
    }
    
    // 4. Update Document Status
    await supabase
      .from('documents')
      .update({
        status: 'ready',
        rag_indexed: true,
        rag_indexed_at: new Date().toISOString(),
        chunk_count: chunks.length,
      })
      .eq('id', documentId);
    
    console.log(`🏁 [Neural Sync] Synchronization complete.`);
    
  } catch (error: any) {
    console.error(`❌ [Neural Sync] Fatal failure:`, error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw error;
  }
}
