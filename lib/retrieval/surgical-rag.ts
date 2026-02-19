import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../rag/embeddings';

/**
 * SURGICAL RAG ENGINE (v1.0)
 * Implementation of RALPH Requirement FP-03: Disconnected SLO-Chunk relationship.
 */
export class SurgicalRAG {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Performs an atomic retrieval based on SLO codes before falling back to vector search.
   */
  public async retrieve(query: string, documentId: string) {
    // 1. ATOMIC SLO EXTRACTION (Regex)
    const sloMatch = query.match(/[A-Z]\d{2}[A-Z]\d{2,4}/i);
    const sloCode = sloMatch ? sloMatch[0].toUpperCase().replace(/-/g, '') : null;

    if (sloCode) {
      // Direct lookup in our new SLO mapping junction
      const { data: mappedChunks } = await this.supabase
        .from('slo_database')
        .select(`
          slo_full_text,
          chunk_slo_mapping (
            chunk_id,
            document_chunks (chunk_text, metadata)
          )
        `)
        .eq('slo_code', sloCode)
        .eq('document_id', documentId)
        .limit(1);

      if (mappedChunks?.[0]) {
        console.log(`🎯 [Surgical RAG] Atomic SLO Hit: ${sloCode}`);
        const mc = mappedChunks[0] as any;
        return {
          context: mc.chunk_slo_mapping?.document_chunks?.chunk_text || mc.slo_full_text,
          method: 'atomic_slo_map'
        };
      }
    }

    // 2. FALLBACK: HYBRID SEMANTIC SEARCH
    const embedding = await generateEmbedding(query);
    const { data: hybridResults } = await this.supabase.rpc('hybrid_search_chunks_v6', {
      query_text: query,
      query_embedding: embedding,
      match_count: 8,
      filter_document_ids: [documentId]
    });

    if (hybridResults && hybridResults.length > 0) {
      return {
        context: hybridResults.map((r: any) => r.chunk_text).join('\n---\n'),
        method: 'hybrid_semantic'
      };
    }

    return { context: "", method: 'none' };
  }
}