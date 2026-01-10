
import { SupabaseClient } from '@supabase/supabase-js';
import { getObjectText } from '../r2';

export interface DocumentContent {
  id: string;
  filename: string;
  extractedText: string;
  subject: string | null;
  gradeLevel: string | null;
  sloTags: any[];
  wordCount: number;
  mimeType: string;
  filePath: string;
}

/**
 * Fetch selected documents for a user WITH actual content from R2/Supabase.
 * Optimized to handle multimodal assets (PDFs/Images) for providers like Gemini.
 */
export async function getSelectedDocumentsWithContent(
  supabase: SupabaseClient,
  userId: string
): Promise<DocumentContent[]> {
  try {
    // Priority 1: Specifically selected documents
    let { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .eq('is_selected', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching document metadata:', error);
      return [];
    }

    // Priority 2: Fallback to the profile's active_doc_id if no selection exists
    if (!documents || documents.length === 0) {
      const { data: profile } = await supabase.from('profiles').select('active_doc_id').eq('id', userId).single();
      if (profile?.active_doc_id) {
        const { data: altDoc } = await supabase.from('documents').select('*').eq('id', profile.active_doc_id).single();
        if (altDoc) documents = [altDoc];
      }
    }

    if (!documents || documents.length === 0) return [];

    const documentsWithContent: DocumentContent[] = [];

    for (const doc of documents) {
      try {
        let extractedText = doc.extracted_text || '';

        // If no text cached in DB, try fetching from R2/Storage
        if (!extractedText || extractedText.trim().length === 0) {
          const key = doc.extracted_text_r2_key || doc.r2_key || doc.file_path;
          // Only attempt string fetch for text-based types or if explicitly cached as .txt
          if (key && (doc.mime_type.startsWith('text/') || doc.extracted_text_r2_key)) {
            extractedText = await getObjectText(key);
          }
        }

        // Even if text is empty (Multimodal file like PDF), we return the metadata
        // so Gemini can process it via inlineData.
        documentsWithContent.push({
          id: doc.id,
          filename: doc.name || doc.filename,
          extractedText: extractedText.substring(0, 25000), // Larger window for multi-model logic
          subject: doc.subject,
          gradeLevel: doc.grade_level,
          sloTags: doc.slo_tags || [],
          wordCount: doc.word_count || 0,
          mimeType: doc.mime_type,
          filePath: doc.file_path
        });
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
 * Build deterministic context string for AI vault.
 */
export function buildDocumentContextString(documents: DocumentContent[]): string {
  if (documents.length === 0) return '';

  return documents.map(doc => `
--- START ASSET: ${doc.filename} ---
METADATA:
- ID: ${doc.id}
- MIME: ${doc.mimeType}
- Subject: ${doc.subject || 'Not Set'}
- Grade Level: ${doc.gradeLevel || 'Not Set'}

CONTENT_TEXT_EXTRACT:
${doc.extractedText || '[NON_TEXT_ASSET: Content available via native multimodal vision/parsing]'}
--- END ASSET: ${doc.filename} ---
`).join('\n\n');
}
