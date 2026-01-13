
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
 * HYBRID CURRICULUM RETRIEVER (v5.0 - SCRAPE PRIORITY)
 * Logic Flow:
 * 1. Identify SLO/Keywords.
 * 2. Aggressively Scrape Sindh Portal (DCAR) immediately.
 * 3. Augment with Local PDF library.
 */
export async function retrieveHybridContext(
  message: string,
  documentIds: string[],
  supabase: SupabaseClient,
  targetSLO?: string
): Promise<HybridRetrievalResult> {
  
  // 1. Proactive Web Scrape (PRIORITY)
  // We no longer check local confidence first; we always want the latest portal data if an SLO is detected.
  let webScrape: ScrapedContent | null = null;
  
  // Target SLO is the primary trigger, but we also scrape for high-value curriculum keywords
  const curriculumKeywords = /science|math|english|curriculum|standards|slo|syllabus/i;
  const shouldScrape = targetSLO || curriculumKeywords.test(message);

  if (shouldScrape) {
    const searchQuery = targetSLO || message;
    console.log(`🌐 [Hybrid Priority] Aggressive Scrape initiated for: ${searchQuery}`);
    webScrape = await scrapeSindhCurriculum(searchQuery);
  }

  // 2. Local Document Augmentation
  let localChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    localChunks = await retrieveRelevantChunks(message, documentIds, supabase, 10);
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
