
import { SupabaseClient } from '@supabase/supabase-js';
import { retrieveRelevantChunks, RetrievedChunk } from './retriever';
import { scrapeSindhCurriculum, ScrapedContent } from '../curriculum/web-scraper';

export interface HybridRetrievalResult {
  localChunks: RetrievedChunk[];
  webScrape: ScrapedContent | null;
  isGrounded: boolean;
  groundingSource: 'local' | 'web' | 'mixed' | 'none';
}

/**
 * HYBRID CURRICULUM RETRIEVER (v4.0)
 * Logic Flow:
 * 1. Check Local PDF library (Vector Search).
 * 2. If SLO confidence is low: Scrape Sindh Portal (Cheerio).
 * 3. Return combined intelligence package.
 */
export async function retrieveHybridContext(
  message: string,
  documentIds: string[],
  supabase: SupabaseClient,
  targetSLO?: string
): Promise<HybridRetrievalResult> {
  
  // 1. Local Search
  let localChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    localChunks = await retrieveRelevantChunks(message, documentIds, supabase, 10);
  }

  const hasHighConfidenceLocal = localChunks.length > 0 && localChunks[0].similarity > 0.4;
  
  // 2. Targeted Web Scrape (Fallback for missing or low-confidence SLOs)
  let webScrape: ScrapedContent | null = null;
  
  // Only scrape if we have an SLO code and local data is sparse
  if (targetSLO && !hasHighConfidenceLocal) {
    console.log(`🕵️ [Hybrid] Pivoting to Live Web Scrape for SLO: ${targetSLO}`);
    webScrape = await scrapeSindhCurriculum(targetSLO);
  }

  const isGrounded = localChunks.length > 0 || webScrape !== null;
  let groundingSource: HybridRetrievalResult['groundingSource'] = 'none';
  
  if (localChunks.length > 0 && webScrape) groundingSource = 'mixed';
  else if (localChunks.length > 0) groundingSource = 'local';
  else if (webScrape) groundingSource = 'web';

  return {
    localChunks,
    webScrape,
    isGrounded,
    groundingSource
  };
}
