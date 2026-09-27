import { SupabaseClient } from '@supabase/supabase-js';
import { retrieveRelevantChunks, RetrievedChunk } from './retriever';
import { indexDocumentForRAG } from './document-indexer';
import { generateEmbedding } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';

export interface RAGSearchOptions {
  query: string;
  documentIds?: string[];
  supabase: SupabaseClient;
  matchCount?: number;
  dialect?: string;
  includeAuthoritativeSLOs?: boolean;
}

export interface GroundedContextResult {
  groundedText: string;
  isGrounded: boolean;
  retrievedChunks: RetrievedChunk[];
  matchedSlos: any[];
  sourceDocumentNames: string[];
}

/**
 * UNIFIED SUPABASE PGVECTOR RAG PIPELINE
 * Provides vector-grounded retrieval, indexing, and contextual synthesis.
 */
export class RAGPipeline {
  /**
   * Search through curriculum documents using pgvector similarity and keyword scoring.
   */
  public static async searchVault(options: RAGSearchOptions): Promise<RetrievedChunk[]> {
    const { query, documentIds = [], supabase, matchCount = 8, dialect } = options;
    if (documentIds.length === 0) return [];

    return retrieveRelevantChunks({
      query,
      documentIds,
      supabase,
      matchCount,
      dialect
    });
  }

  /**
   * Constructs a high-fidelity, grounded pedagogical context for LLM prompt injection.
   */
  public static async buildGroundedContext(options: RAGSearchOptions): Promise<GroundedContextResult> {
    const { query, documentIds = [], supabase, matchCount = 10, includeAuthoritativeSLOs = true } = options;

    if (documentIds.length === 0) {
      return {
        groundedText: '',
        isGrounded: false,
        retrievedChunks: [],
        matchedSlos: [],
        sourceDocumentNames: []
      };
    }

    // 1. Fetch source document metadata
    const { data: documents } = await supabase
      .from('documents')
      .select('id, name, subject, grade_level')
      .in('id', documentIds);

    const docNames = documents?.map(d => d.name) || [];

    // 2. Vector Retrieval via Supabase pgvector
    const retrievedChunks = await retrieveRelevantChunks({
      query,
      documentIds,
      supabase,
      matchCount
    });

    // 3. Authoritative SLO Table Lookup
    let matchedSlos: any[] = [];
    if (includeAuthoritativeSLOs) {
      const extractedCodes = extractSLOCodes(query).map(c => normalizeSLO(c.code));
      
      let sloQuery = supabase
        .from('slo_database')
        .select('*')
        .in('document_id', documentIds);

      if (extractedCodes.length > 0) {
        sloQuery = sloQuery.in('slo_code', extractedCodes);
      } else {
        // Match by token keywords
        const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 4);
        if (keywords.length > 0) {
          const filterStr = keywords.map(k => `slo_full_text.ilike.%${k}%`).join(',');
          sloQuery = sloQuery.or(filterStr).limit(10);
        } else {
          sloQuery = sloQuery.limit(5);
        }
      }

      const { data: slos } = await sloQuery;
      matchedSlos = slos || [];
    }

    // 4. Assemble Grounded Context
    let contextBuffer = '';
    const isGrounded = retrievedChunks.length > 0 || matchedSlos.length > 0;

    if (matchedSlos.length > 0) {
      contextBuffer += `### 📜 OFFICIAL STUDENT LEARNING OUTCOMES (GROUND TRUTH)\n`;
      matchedSlos.forEach(slo => {
        contextBuffer += `[SLO_CODE: ${slo.slo_code || 'STANDARD'}] | Grade: ${slo.grade_level || 'N/A'} | Domain: ${slo.domain_name || slo.domain || 'N/A'}\n`;
        contextBuffer += `Cognitive Level: ${slo.bloom_level || 'Understand'} | Complexity: ${slo.cognitive_complexity || 'N/A'}\n`;
        contextBuffer += `Description: ${slo.slo_full_text}\n\n`;
      });
    }

    if (retrievedChunks.length > 0) {
      contextBuffer += `### 📚 RETRIEVED CURRICULUM CONTEXT (SUPABASE VECTOR MATCHES)\n`;
      retrievedChunks.forEach((chunk, idx) => {
        const scorePct = Math.round((chunk.combined_score || 0.8) * 100);
        contextBuffer += `[CHUNK #${idx + 1} | Relevance: ${scorePct}%]\n`;
        contextBuffer += `${chunk.chunk_text}\n---\n`;
      });
    }

    return {
      groundedText: contextBuffer.trim(),
      isGrounded,
      retrievedChunks,
      matchedSlos,
      sourceDocumentNames: docNames
    };
  }

  /**
   * Index a curriculum document into Supabase pgvector store.
   */
  public static async indexDocument(
    documentId: string,
    content: string,
    supabase: SupabaseClient,
    jobId?: string
  ) {
    return indexDocumentForRAG(documentId, content, supabase, jobId);
  }
}
