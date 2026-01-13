
// Fix: Added missing Buffer import to resolve "Cannot find name 'Buffer'" error
import { Buffer } from 'buffer';
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * SINDH CURRICULUM TARGET NODES
 * Includes the main portal and specific high-value PDFs for deep pedagogical analysis.
 */
const SINDH_CURRICULUM_TARGETS = [
  'https://dcar.gos.pk/Sindh%20Curriculum.html',
  'https://dcar.gos.pk/Sindh-Curriculum/General%20Science%20Grade%20IV-VIII%2002%20May%202024.pdf'
];

export interface ScrapedContent {
  source: string;
  url: string;
  text: string;
  title: string;
}

/**
 * SINDH CURRICULUM PORTAL SCRAPER (v4.5)
 * Dynamically switches between HTML and PDF parsing based on the target source.
 */
export async function scrapeSindhCurriculum(query: string): Promise<ScrapedContent | null> {
  const queryLower = query.toLowerCase();
  let accumulatedText = '';
  let successfulUrl = '';
  let pageTitle = 'Sindh Curriculum Intelligence';

  console.log(`🕵️ [Neural Scraper] Initiating crawl for: "${query}"`);

  for (const url of SINDH_CURRICULUM_TARGETS) {
    try {
      const isPdf = url.toLowerCase().endsWith('.pdf');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 30000,
        responseType: isPdf ? 'arraybuffer' : 'text'
      });

      if (isPdf) {
        // Handle PDF Content Synthesis
        // Note: Dynamic import for pdf-parse to handle server-side environment correctly
        const pdfModule = await import('pdf-parse');
        const pdf: any = pdfModule.default || pdfModule;
        const data = await pdf(Buffer.from(response.data));
        const fullText = data.text || '';
        
        // Find the needle in the curriculum haystack
        const index = fullText.toLowerCase().indexOf(queryLower);
        if (index !== -1) {
          const start = Math.max(0, index - 800);
          const end = Math.min(fullText.length, index + 3000);
          accumulatedText += `\n[SOURCE: SINDH_PDF_ASSET - ${url.split('/').pop()}]\n${fullText.substring(start, end)}\n`;
          successfulUrl = url;
          pageTitle = 'Sindh Science Curriculum (Verified PDF)';
          console.log(`✅ [Scraper] Match found in PDF: ${url}`);
        }
      } else {
        // Handle HTML Content Parsing
        const $ = cheerio.load(response.data);
        
        // Remove noise
        $('script, style, nav, footer, header, noscript, .sidebar, .ads').remove();
        
        let foundOnPage = '';
        
        // Check curriculum tables (Preferred format for DCAR)
        $('table tr').each((_, element) => {
          const rowText = $(element).text().trim();
          if (rowText.toLowerCase().includes(queryLower)) {
            foundOnPage += ` [Grid Entry] ${rowText}\n`;
          }
        });

        // Check semantic content blocks
        if (foundOnPage.length < 100) {
          $('p, li, h1, h2, h3, h4').each((_, element) => {
            const text = $(element).text().trim();
            if (text.toLowerCase().includes(queryLower) && text.length > 15) {
              foundOnPage += ` [Portal Content] ${text}\n`;
            }
          });
        }

        if (foundOnPage.length > 0) {
          accumulatedText += `\n[SOURCE: SINDH_PORTAL_HTML]\n${foundOnPage}\n`;
          successfulUrl = url;
          const siteTitle = $('title').text().trim();
          if (siteTitle) pageTitle = siteTitle;
          console.log(`✅ [Scraper] Match found on Portal: ${url}`);
        }
      }
      
      // Optimization: If we have found substantial grounded context, stop the crawl
      if (accumulatedText.length > 4000) break;

    } catch (error: any) {
      console.error(`⚠️ [Scraper] Source node unreachable (${url}):`, error.message);
    }
  }

  if (accumulatedText.length < 20) {
    console.log(`📡 [Scraper] Global Sindh Portal search returned zero high-confidence matches.`);
    return null;
  }

  return {
    source: 'Directorate of Curriculum, Assessment and Research (DCAR) - Sindh',
    url: successfulUrl || SINDH_CURRICULUM_TARGETS[0],
    title: pageTitle,
    text: accumulatedText.trim()
  };
}
