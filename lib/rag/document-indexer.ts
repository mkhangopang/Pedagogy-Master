import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

/**
 * DEEP PEDAGOGICAL METADATA EXTRACTOR
 * Identifies Grade Spans (e.g., Grade IV-VIII) in documents.
 */
function extractBlockMetadata(text: string, sloCodes: string[]) {
  const grades = new Set<string>();
  
  // Pattern: "Grade IV-VIII" or "Grade 4"
  const gradeMatches = text.match(/(?:Grade|Class|Level)\s*([IVXLCDM\d\-\s,]+)/gi);
  if (gradeMatches) {
    gradeMatches.forEach(m => {
      const span = m.replace(/(?:Grade|Class|Level)\s*/i, '');
      // Handle Roman Numerals and Spans (IV-VIII)
      const romanMap: any = { 'IV': '4', 'V': '5', 'VI': '6', 'VII': '7', 'VIII': '8' };
      Object.keys(romanMap).forEach(key => {
        if (span.includes(key)) grades.add(romanMap[key]);
      });
      // Handle digits
      const digits = span.match(/\d+/g);
      if (digits) digits.forEach(d => grades.add(d));
    });
  }

  // Also infer grade from specific SLO code prefix (S-07 -> Grade 7)
  sloCodes.forEach(code => {
    const match = code.match(/S-(\d{2})/);
    if (match) grades.add(parseInt(match[1], 10).toString());
  });

  return {
    grade_levels: Array.from(grades),
    is_slo_definition: text.includes('SLO:') || text.includes('S-')
  };
}

export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  try {
    console.log(`📡 [Neural Indexer] Synced Doc ID: ${documentId}`);
    
    // Split by Markdown Headers (Units, Chapters, Standards)
    const blocks = content.split(/(?=^#+\s+|^Standard:|^SLO:)/gim);
    const processedChunks: any[] = [];

    blocks.forEach((block, index) => {
      const text = block.trim();
      if (text.length < 20) return;

      // Aggressive SLO Extraction from highlight format "SLO: S-07-B-44"
      const sloMatches = text.match(/S-\d{2}-[A-Z]-\d{2}/gi) || [];
      const normalizedCodes = Array.from(new Set(sloMatches.map(c => c.toUpperCase())));
      
      const meta = extractBlockMetadata(text, normalizedCodes);
      
      processedChunks.push({
        text,
        sloCodes: normalizedCodes,
        metadata: { ...meta, chunk_index: index }
      });
    });

    const BATCH_SIZE = 10;
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));

      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.sloCodes,
        grade_levels: chunk.metadata.grade_levels,
        metadata: chunk.metadata
      }));

      if (i === 0) await supabase.from('document_chunks').delete().eq('document_id', documentId);
      await supabase.from('document_chunks').insert(records);
    }

    await supabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', documentId);
    return { success: true };
  } catch (error) {
    console.error("Indexer Fault:", error);
    throw error;
  }
}
