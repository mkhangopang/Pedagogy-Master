import { SupabaseClient } from '@supabase/supabase-js';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';
import { orchestrator } from '../ai/model-orchestrator';
import { Buffer } from 'buffer';

/**
 * STRUCTURE-AWARE NEURAL INDEXER (v7.5)
 * FIX: Persistent Hierarchy State - Prevents loop variable collision.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  supabase: SupabaseClient,
  jobId?: string
) {
  try {
    const { data: docMeta } = await supabase.from('documents').select('subject, grade_level').eq('id', documentId).single();
    
    // Persistent context that won't reset to N/A accidentally
    const contextState = {
      subject: docMeta?.subject || "General",
      grade: docMeta?.grade_level || "Auto",
      domain: "Standard"
    };

    const lines = content.split('\n');
    const nodes: any[] = [];
    let buffer = "";
    let codesInChunk = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Update sticky hierarchy state only when specific markers are found
      if (line.match(/^Board:|^Subject:/i)) {
        contextState.subject = line.split(':')[1]?.trim() || contextState.subject;
      } else if (line.startsWith('# GRADE')) {
        contextState.grade = line.replace('# GRADE', '').trim();
      } else if (line.startsWith('### DOMAIN')) {
        contextState.domain = line.replace('### DOMAIN', '').trim();
      }

      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => { 
        const normalized = normalizeSLO(c.code);
        if (normalized) codesInChunk.add(normalized);
      });

      buffer += (buffer ? '\n' : '') + line;

      // Dynamic Chunking
      if (buffer.length >= 1000 || i === lines.length - 1) {
        const fingerprint = Buffer.from(buffer.trim()).toString('base64').substring(0, 50);
        const header = `[NODE: ${contextState.subject} > ${contextState.grade} > ${contextState.domain}]\n`;
        const text = header + buffer.trim();

        nodes.push({
          text,
          fingerprint,
          metadata: {
            ...contextState,
            slo_codes: Array.from(codesInChunk),
            tokens: Math.ceil(text.length / 4)
          }
        });

        buffer = "";
        codesInChunk.clear();
      }
    }

    // Processing with Orchestrator (Using Cerebras for embeddings speed if available)
    for (const node of nodes) {
      // Use standard embedding model via orchestrator
      const { data: embeddingRes } = await supabase.rpc('generate_embedding', { input_text: node.text });
      
      const record = {
        document_id: documentId,
        chunk_text: node.text,
        embedding: embeddingRes,
        slo_codes: node.metadata.slo_codes,
        semantic_fingerprint: node.fingerprint,
        token_count: node.metadata.tokens,
        metadata: node.metadata
      };

      await supabase.from('document_chunks').upsert(record, { onConflict: 'semantic_fingerprint' });
    }

    return { success: true, count: nodes.length };
  } catch (error: any) {
    console.error("❌ [Indexer Fault]:", error.message);
    throw error;
  }
}