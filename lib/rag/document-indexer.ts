
import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

/**
 * HIGH-FIDELITY PEDAGOGICAL INDEXER (v221.0)
 * Logic: Continuum-Aware Hierarchical Mapping (ECE to XII).
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  try {
    const meta = preExtractedMeta || {};
    const lines = content.split('\n');
    
    let currentGrade = "N/A";
    let currentCompetency = "General";
    let currentStandard = "General";
    let currentBenchmark = "N/A";
    
    const nodes: any[] = [];
    let buffer = "";
    let codesInChunk: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Detect Contextual Shifts including ECE and full Roman Grades
      if (line.startsWith('# GRADE') || line.includes('# ECE')) {
        currentGrade = line.replace('# GRADE', '').replace('# ', '').trim();
      } else if (line.startsWith('## DOMAIN') || line.startsWith('## Competency')) {
        currentCompetency = line.split(':')[1]?.trim() || line.replace('##', '').trim();
      } else if (line.startsWith('### STANDARD')) {
        currentStandard = line.replace('###', '').trim();
      } else if (line.startsWith('#### BENCHMARK')) {
        currentBenchmark = line.replace('####', '').trim();
      }

      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => { if (!codesInChunk.includes(c.code)) codesInChunk.push(c.code); });

      buffer += (buffer ? '\n' : '') + line;

      // CHUNK TRIGGER: Optimized for 1500 chars to maximize reasoning window
      if (buffer.length >= 1500 || i === lines.length - 1) {
        // ENFORCEMENT: Prepend Lineage to every chunk
        const descriptor = `[IDENTITY: Grade ${currentGrade} | ${currentCompetency} | ${currentStandard}]\n`;
        const enrichedText = descriptor + buffer.trim();

        nodes.push({
          text: enrichedText,
          metadata: {
            grade: currentGrade,
            competency: currentCompetency,
            standard: currentStandard,
            benchmark: currentBenchmark,
            slo_codes: [...codesInChunk],
            dialect: meta.dialect || 'Standard'
          }
        });

        buffer = "";
        codesInChunk = [];
      }
    }

    // Grid Sync Protocol
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const BATCH_SIZE = 10;
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(n => n.text));
      
      const records = batch.map((node, j) => {
        const vec = embeddings[j];
        if (!vec || vec.length !== 768) return null;

        return {
          document_id: documentId,
          chunk_text: node.text,
          embedding: vec,
          slo_codes: node.metadata.slo_codes,
          metadata: node.metadata,
          chunk_index: i + j
        };
      }).filter(Boolean);

      if (records.length > 0) {
        const { error } = await supabase.from('document_chunks').insert(records);
        if (error) throw error;
      }
    }

    await supabase.from('documents').update({ 
      status: 'ready',
      rag_indexed: true,
      chunk_count: nodes.length
    }).eq('id', documentId);

    return { success: true, count: nodes.length };
  } catch (error) {
    console.error("❌ [Indexer Error]:", error);
    throw error;
  }
}
