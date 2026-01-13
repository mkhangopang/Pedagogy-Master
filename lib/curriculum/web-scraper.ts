
import axios from 'axios';
import * as cheerio from 'cheerio';

const SINDH_CURRICULUM_URL = 'https://dcar.gos.pk/Sindh%20Curriculum.html','https://dcar.gos.pk/Sindh-Curriculum/General%20Science%20Grade%20IV-VIII%2002%20May%202024.pdf';

export interface ScrapedContent {
  source: string;
  url: string;
  text: string;
  title: string;
}

/**
 * SINDH CURRICULUM PORTAL SCRAPER
 * Targets DCAR portal for live SLO verification.
 */
export async function scrapeSindhCurriculum(query: string): Promise<ScrapedContent | null> {
  try {
    console.log(`🌐 [Scraper] Initiating target fetch: ${SINDH_CURRICULUM_URL}`);
    
    // Fetch HTML with a browser-like user agent
    const { data: html } = await axios.get(SINDH_CURRICULUM_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(html);
    
    // Clean up unwanted tags
    $('script, style, nav, footer, header, noscript').remove();

    // Strategy: Look for the specific SLO or keywords within educational containers
    // DCAR often uses tables or lists for curriculum display
    let relevantText = '';
    
    // Check tables first (curriculum common format)
    $('table tr').each((_, element) => {
      const rowText = $(element).text().trim();
      if (rowText.toLowerCase().includes(query.toLowerCase())) {
        relevantText += ` [Table Row] ${rowText}\n`;
      }
    });

    // Fallback to general paragraph search if table search yields little
    if (relevantText.length < 100) {
      $('p, li, h1, h2, h3, h4').each((_, element) => {
        const text = $(element).text().trim();
        if (text.toLowerCase().includes(query.toLowerCase()) && text.length > 20) {
          relevantText += ` [Content] ${text}\n`;
        }
      });
    }

    if (relevantText.length < 50) return null;

    return {
      source: 'Sindh Curriculum Portal (DCAR)',
      url: SINDH_CURRICULUM_URL,
      title: $('title').text().trim() || 'Sindh Curriculum',
      text: relevantText.substring(0, 5000) // Truncate to avoid context overflow
    };
  } catch (error) {
    console.error('❌ [Scraper Error]:', error);
    return null;
  }
}
