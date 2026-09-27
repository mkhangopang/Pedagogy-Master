import { SupabaseClient } from '@supabase/supabase-js';
import { retrieveRelevantChunks } from '../rag/retriever';

/**
 * SURGICAL RAG ENGINE (v3.0 - PGVECTOR EDITION)
 * Mission: Zero-hallucination standards grounding via bi-directional junction mapping & pgvector search.
 */
export class SurgicalRAG {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Performs an atomic retrieval based on SLO codes before falling back to pgvector search.
   */
  public async retrieve(query: string, documentId: string) {
    // 1. ATOMIC SLO EXTRACTION (Regex)
    const sloMatch = query.match(/[A-Z]\d{2}[A-Z]\d{2,4}/i);
    const sloCode = sloMatch ? sloMatch[0].toUpperCase().replace(/-/g, '') : null;

    if (sloCode) {
      // Direct lookup in our SLO mapping junction
      const { data: mappedResults } = await this.supabase
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
            context: chunks.map((c: any) => c.document_chunks?.chunk_text).filter(Boolean).join('\n---\n'),
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

    // 2. FALLBACK: HYBRID PGVECTOR SEMANTIC SEARCH
    const chunks = await retrieveRelevantChunks({
      query,
      documentIds: [documentId],
      supabase: this.supabase,
      matchCount: 8
    });

    if (chunks.length > 0) {
      return {
        context: chunks.map(r => r.chunk_text).join('\n---\n'),
        method: 'hybrid_pgvector_search',
        retrievedCount: chunks.length
      };
    }

    return { context: "", method: 'none' };
  }
}
