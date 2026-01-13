import axios from 'axios';
import * as cheerio from 'cheerio';

const SINDH_CURRICULUM_URL = 'https://dcar.gos.pk/Sindh%20Curriculum.html';

export interface ScrapedContent {
  source: string;
  url: string;
  text: string;
  title: string;
}

/**
 * SINDH CURRICULUM PORTAL SCRAPER
 * Targets DCAR portal for live SLO verification.
 * Optimized for the specific structure of the Sindh curriculum website.
 */
export async function scrapeSindhCurriculum(query: string): Promise<ScrapedContent | null> {
  try {
    console.log(`🌐 [Scraper] Initiating target fetch: ${SINDH_CURRICULUM_URL}`);
    
    // Fetch HTML with a browser-like user agent to avoid bot blocks
    const { data: html } = await axios.get(SINDH_CURRICULUM_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 20000 // Increased timeout for potentially slow government servers
    });

    const $ = cheerio.load(html);
    
    // Clean up unwanted tags that pollute context
    $('script, style, nav, footer, header, noscript, iframe, .sidebar').remove();

    let relevantText = '';
    const queryLower = query.toLowerCase();
    
    // 1. Check tables (Primary structure for curriculum standards in Sindh)
    $('table tr').each((_, element) => {
      const rowText = $(element).text().trim();
      if (rowText.toLowerCase().includes(queryLower)) {
        relevantText += ` [Curriculum Table Row] ${rowText}\n`;
      }
    });

    // 2. Check hyperlinks (Useful for finding specific PDF curriculum documents)
    $('a').each((_, element) => {
      const linkText = $(element).text().trim();
      const href = $(element).attr('href');
      if (linkText.toLowerCase().includes(queryLower) && href) {
        // Resolve relative URLs if necessary
        const absoluteUrl = href.startsWith('http') ? href : `https://dcar.gos.pk/${href}`;
        relevantText += ` [Curriculum Resource Found: ${linkText}] (Link: ${absoluteUrl})\n`;
      }
    });

    // 3. Fallback to general content block search
    if (relevantText.length < 150) {
      $('div, p, li, h1, h2, h3, h4').each((_, element) => {
        const text = $(element).text().trim();
        if (text.toLowerCase().includes(queryLower) && text.length > 25) {
          relevantText += ` [Portal Context] ${text}\n`;
        }
      });
    }

    if (relevantText.length < 30) {
      console.log(`📡 [Scraper] No relevant matches found on the Sindh portal for: ${query}`);
      return null;
    }

    console.log(`✅ [Scraper] Successfully extracted ${relevantText.length} characters of context.`);

    return {
      source: 'Sindh Curriculum Portal (DCAR)',
      url: SINDH_CURRICULUM_URL,
      title: $('title').text().trim() || 'Sindh Curriculum - Directorate of Curriculum, Assessment and Research',
      text: relevantText.substring(0, 10000) // Ample context for Gemini 3
    };
  } catch (error: any) {
    console.error('❌ [Scraper Fatal]:', error.message || error);
    return null;
  }
}