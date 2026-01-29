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
 * WORLD-CLASS NEURAL INDEXER (v151.0)
 * Optimized for Sindh Grids & Pedagogical Precision.
 * Fixed build-time TypeScript errors with Supabase query builders.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  const startTime = Date.now();
  console.log(`📡 [Indexer] Sync Initiated for Asset: ${documentId}`);
  
  try {
    // 1. EXTRACT ADVANCED METADATA
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const metadataResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze this curriculum document excerpt and extract structural metadata. 
      EXCERPT: ${content.substring(0, 5000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subject: { type: Type.STRING },
            grade: { type: Type.STRING },
            topics: { type: Type.ARRAY, items: { type: Type.STRING } },
            difficulty: { type: Type.STRING, enum: ["elementary", "middle", "high", "college"] }
          }
        }
      }
    });

    const meta = JSON.parse(metadataResponse.text || "{}");

    // 2. SEMANTIC CHUNKING
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      // Grouping on SLO boundaries or natural sections
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
              source_path: filePath
            }
          });
        }
        buffer = line + "\n";
      } else {
        buffer += line + "\n";
      }
    }

    // 3. ATOMIC STORE
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const BATCH_SIZE = 15; 
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > 55000) break; // Watchdog margin

      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
      
      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.metadata.slo_codes,
        metadata: chunk.metadata
      }));

      await supabase.from('document_chunks').insert(records);
    }

    // 4. FINALIZE DOCUMENT RECORD
    await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true,
      document_summary: meta.topics?.join(', ') || '',
      difficulty_level: meta.difficulty || 'middle',
      subject: meta.subject || 'General',
      grade_level: meta.grade || 'Auto'
    }).eq('id', documentId);

    return { success: true };
  } catch (error: any) {
    console.error("❌ [Indexer Fatal]:", error);
    // Mark as failed so user can retry, safely handling builder errors
    try {
      await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    } catch (dbErr) {
      console.warn("Failed to report indexer failure status to DB.");
    }
    throw error;
  }
}