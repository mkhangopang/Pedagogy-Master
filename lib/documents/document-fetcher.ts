
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
    // 1. Get selected document metadata from Supabase
    // We prioritize the single document explicitly marked as 'is_selected'
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .eq('is_selected', true)
      .order('updated_at', { ascending: false })
      .limit(1); // Usually one primary context document is best for focus

    if (error) {
      console.error('Error fetching document metadata:', error);
      return [];
    }

    if (!documents || documents.length === 0) return [];

    const documentsWithContent: DocumentContent[] = [];

    for (const doc of documents) {
      try {
        let extractedText = '';

        if (doc.extracted_text) {
          extractedText = doc.extracted_text;
        } else {
          const key = doc.extracted_text_r2_key || doc.r2_key || doc.file_path;
          if (key) {
            extractedText = await getObjectText(key);
          }
        }

        if (extractedText) {
          // Truncate to avoid context overflow (max 7000 chars)
          const truncatedText = extractedText.substring(0, 7000);
          
          documentsWithContent.push({
            id: doc.id,
            filename: doc.name || doc.filename,
            extractedText: extractedText.length > 7000 
              ? truncatedText + '\n\n[Document truncated for context space]'
              : truncatedText,
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

  let context = "\n### MANDATORY SOURCE MATERIAL: CURRICULUM CONTEXT ###\n";
  context += "The user has provided the following curriculum document. You MUST base your response strictly on this information if it is relevant. Ignore general information that contradicts this source.\n";

  for (const doc of documents) {
    context += `
--- DOCUMENT START: ${doc.filename} ---
SUBJECT: ${doc.subject || 'N/A'}
GRADE: ${doc.gradeLevel || 'N/A'}
CONTENT:
${doc.extractedText}
--- DOCUMENT END ---
`;
  }

  context += `
INSTRUCTION:
1. Your response MUST be strictly aligned with the provided curriculum content above.
2. If the user asks for a lesson plan or tool, use the SLOs, terminology, and standards found in the document.
3. If the provided document does not contain the answer, say "The current document doesn't provide this specific information," and then offer a general pedagogical suggestion based on best practices.
4. Use the document name "${documents[0]?.filename}" as a reference in your response.
`;

  return context;
}
