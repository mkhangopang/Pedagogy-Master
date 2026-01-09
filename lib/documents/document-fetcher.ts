
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
          // Truncate to a safe context window for Llama/Groq (approx 12k chars)
          const truncatedText = extractedText.substring(0, 12000);
          
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
--- START OF CURRICULUM SOURCE: ${doc.filename} ---
${doc.extractedText}
--- END OF CURRICULUM SOURCE: ${doc.filename} ---

### MANDATORY COMPLIANCE RULES:
1. THE TEXT ABOVE IS YOUR ONLY ALLOWED KNOWLEDGE BASE.
2. IF A CODE (e.g. "S8 A5") IS REQUESTED, YOU MUST FIND THE EXACT MATCH IN THE TEXT ABOVE.
3. IF YOU CANNOT FIND THE EXACT CODE IN THE TEXT, YOU MUST SAY: "I apologize, but ${doc.filename} does not contain an entry for that specific code."
4. DO NOT SEARCH THE INTERNET. DO NOT USE PRE-TRAINED DATA FOR CURRICULUM CODES.
`;
}
