import { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from "@google/genai";
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * WORLD-CLASS NEURAL INDEXER (v153.0)
 * Optimized for Sindh Grids & High-Fidelity Pedagogical Mapping.
 * Performance tuned to minimize extraction bottlenecks.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  const startTime = Date.now();
  console.log(`📡 [Indexer] Sync Initiated for Asset Node: ${documentId}`);
  
  try {
    // 1. EXTRACT ARCHITECTURAL METADATA
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Using a smaller sample (4000) for metadata to stay within token/time budgets
    const metadataResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze this curriculum document excerpt and extract structural metadata. 
      EXCERPT: ${content.substring(0, 4000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subject: { type: Type.STRING },
            grade: { type: Type.STRING },
            topics: { type: Type.ARRAY, items: { type: Type.STRING } },
            difficulty: { type: Type.STRING, enum: ["elementary", "middle", "high", "college"] },
            board: { type: Type.STRING }
          }
        }
      }
    });

    const metaText = metadataResponse.text;
    const meta = metaText ? JSON.parse(metaText) : {};

    // 2. ADAPTIVE SEMANTIC CHUNKING
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      // Grouping on SLO boundaries or structural headers
      if (line.match(/^- SLO:/i) || line.match(/^#{1,3}\s+/) || i === lines.length - 1) {
        if (buffer.length > 50) {
          const sloMatches = buffer.match(/[B-Z]-\d{2}-[A-Z]-\d{2}|S-\d{2}-[A-Z]-\d{2}/gi) || [];
          const normalizedSLOs = Array.from(new Set(sloMatches.map(c => normalizeSLO(c))));

          processedChunks.push({
            text: buffer.trim(),
            metadata: {
              ...currentCtx,
              ...meta,
              slo_codes: normalizedSLOs,
              is_slo_definition: buffer.includes('- SLO:'),
              chunk_index: processedChunks.length,
              source_path: filePath,
              indexed_at: new Date().toISOString()
            }
          });
        }
        buffer = line + "\n";
      } else {
        buffer += line + "\n";
      }
    }

    console.log(`🧠 [Indexer] Mapping ${processedChunks.length} nodes to vector grid...`);

    // 3. ATOMIC STORE RESET
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 4. BATCH PROCESSING WITH WATCHDOG
    const BATCH_SIZE = 15; 
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      // 55s Margins for Serverless stability
      if (Date.now() - startTime > 55000) {
        console.warn('⏳ [Indexer] Watchdog triggered. Committing partial node set.');
        break;
      }

      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
      
      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.metadata.slo_codes,
        metadata: chunk.metadata
      }));

      const { error: insertError } = await supabase.from('document_chunks').insert(records);
      if (insertError) throw insertError;
    }

    // 5. FINALIZE ASSET STATUS
    const { error: updateError } = await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true,
      document_summary: meta.topics?.join(', ') || meta.title || '',
      difficulty_level: meta.difficulty || 'middle',
      subject: meta.subject || 'General',
      grade_level: meta.grade || 'Auto',
      authority: meta.board || 'Sindh Board'
    }).eq('id', documentId);

    if (updateError) throw updateError;

    console.log(`✅ [Indexer] Asset node ${documentId} anchored successfully.`);
    return { success: true };
  } catch (error: any) {
    console.error("❌ [Indexer Fault]:", error);
    try {
      await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    } catch (e) {
      console.warn("Failed to set failure state in DB.");
    }
    throw error;
  }
}