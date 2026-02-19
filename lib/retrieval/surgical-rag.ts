import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../rag/embeddings';

/**
 * SURGICAL RAG ENGINE (v2.0 - RALPH EDITION)
 * Mission: Zero-hallucination standards grounding via bi-directional junction mapping.
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
      // Direct lookup in our new SLO mapping junction (FP-03)
      const { data: mappedResults, error } = await this.supabase
        .from('slo_database')
        .select(`
          slo_full_text,
          chunk_slo_mapping (
            relevance_score,
            document_chunks (chunk_text, metadata)
          )
        `)
        .eq('slo_code', sloCode)
        .eq('document_id', documentId)
        .limit(1);

      if (mappedResults?.[0]) {
        console.log(`🎯 [Surgical RAG] Atomic SLO Hit: ${sloCode}`);
        const m = mappedResults[0] as any;
        const chunks = m.chunk_slo_mapping || [];
        
        if (chunks.length > 0) {
          return {
            context: chunks.map((c: any) => c.document_chunks.chunk_text).join('\n---\n'),
            method: 'atomic_junction_map',
            sloText: m.slo_full_text
          };
        }
        
        // Fallback to the SLO definition itself if no chunks are mapped yet
        return {
          context: `STANDARD DEFINITION: ${m.slo_full_text}`,
          method: 'atomic_slo_registry',
          sloText: m.slo_full_text
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
        method: 'hybrid_semantic_v6'
      };
    }

    return { context: "", method: 'none' };
  }
}
