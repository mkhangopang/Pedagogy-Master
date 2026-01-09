
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
 * Fetch selected documents for a user WITH actual content from R2
 */
export async function getSelectedDocumentsWithContent(
  userId: string
): Promise<DocumentContent[]> {
  try {
    // We prioritize the single document explicitly marked as 'is_selected'
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

    if (!documents || documents.length === 0) return [];

    const documentsWithContent: DocumentContent[] = [];

    for (const doc of documents) {
      try {
        let extractedText = '';

        // Prioritize the actual 'extracted_text' column in Supabase if populated
        if (doc.extracted_text && doc.extracted_text.trim().length > 0) {
          extractedText = doc.extracted_text;
        } else {
          // Fallback to fetching from R2
          const key = doc.extracted_text_r2_key || doc.r2_key || doc.file_path;
          if (key) {
            extractedText = await getObjectText(key);
          }
        }

        if (extractedText && extractedText.trim().length > 0) {
          // Truncate to a safe context window for Llama/Groq (approx 10k chars)
          const truncatedText = extractedText.substring(0, 10000);
          
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
        console.error(`❌ Failed to load content for ${doc.name || doc.filename}:`, docError);
      }
    }

    return documentsWithContent;
  } catch (error) {
    console.error('Error in getSelectedDocumentsWithContent:', error);
    return [];
  }
}

/**
 * Build formatted context string for AI from documents
 */
export function buildDocumentContextString(documents: DocumentContent[]): string {
  if (documents.length === 0) return '';

  const doc = documents[0];
  return `
### THE ONLY ALLOWED SOURCE MATERIAL ###
DOCUMENT_NAME: ${doc.filename}
CONTENT_START:
${doc.extractedText}
CONTENT_END

### MANDATORY BEHAVIORAL CONSTRAINTS ###
1. Your response MUST be 100% based on the "CONTENT" provided above.
2. If the user refers to an SLO code (e.g., "S8 A7") that is NOT explicitly found in the text above, you MUST say: "The selected document (${doc.filename}) does not contain information on [code]. I cannot generate a specific plan for it using this curriculum."
3. DO NOT use your general knowledge to guess what an SLO code means if it is not in the text.
4. If the document is about Science, and the user asks a question that sounds like Math, verify if the Science document supports it. If not, reject the query based on the document's content.
5. Explicitly mention "${doc.filename}" in the first sentence of your response.
`;
}
