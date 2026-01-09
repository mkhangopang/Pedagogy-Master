
import { supabase } from '../supabase';
import { getObjectText } from '../r2';

export interface DocumentContent {
  id: string;
  filename: string;
  extractedText: string;
  subject: string | null;
  gradeLevel: string | null;
  sloTags: any[];
  wordCount: number;
}

/**
 * Fetch selected documents for a user WITH actual content from R2/Supabase
 */
export async function getSelectedDocumentsWithContent(
  userId: string
): Promise<DocumentContent[]> {
  try {
    // 1. Fetch metadata for currently selected document from Supabase
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .eq('is_selected', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching document metadata:', error);
      return [];
    }

    // 2. Fallback check for active_doc_id in user profile if no doc is explicitly selected
    if (!documents || documents.length === 0) {
      const { data: profile } = await supabase.from('profiles').select('active_doc_id').eq('id', userId).single();
      if (profile?.active_doc_id) {
        const { data: altDoc } = await supabase.from('documents').select('*').eq('id', profile.active_doc_id).single();
        if (altDoc) documents.push(altDoc);
      }
    }

    if (!documents || documents.length === 0) return [];

    const documentsWithContent: DocumentContent[] = [];

    for (const doc of documents) {
      try {
        let extractedText = '';

        // Prioritize Supabase 'extracted_text' cache
        if (doc.extracted_text && doc.extracted_text.trim().length > 0) {
          extractedText = doc.extracted_text;
        } else {
          // Fallback to direct fetch from Cloudflare R2
          const key = doc.extracted_text_r2_key || doc.r2_key || doc.file_path;
          if (key) {
            extractedText = await getObjectText(key);
          }
        }

        if (extractedText && extractedText.trim().length > 0) {
          // Truncate to safe context size for models (approx 15k chars)
          const truncatedText = extractedText.substring(0, 15000);
          
          documentsWithContent.push({
            id: doc.id,
            filename: doc.name || doc.filename,
            extractedText: truncatedText,
            subject: doc.subject,
            gradeLevel: doc.grade_level,
            sloTags: doc.slo_tags || [],
            wordCount: doc.word_count || 0
          });
        }
      } catch (docError) {
        console.error(`❌ Ingestion Failure for Asset: ${doc.name}`, docError);
      }
    }

    return documentsWithContent;
  } catch (error) {
    console.error('Critical Fetcher Error:', error);
    return [];
  }
}

/**
 * Build deterministic context string for AI from documents and Supabase metadata.
 */
export function buildDocumentContextString(documents: DocumentContent[]): string {
  if (documents.length === 0) return '[STATUS_EMPTY: NO_ASSETS_MOUNTED]';

  return documents.map(doc => `
--- START ASSET: ${doc.filename} ---
METADATA:
- Subject: ${doc.subject || 'Not Set'}
- Grade Level: ${doc.gradeLevel || 'Not Set'}
- SLO Mappings: ${JSON.stringify(doc.sloTags)}

TEXT_CONTENT:
${doc.extractedText}
--- END ASSET: ${doc.filename} ---
`).join('\n\n');
}
