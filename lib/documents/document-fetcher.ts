
import { supabase } from '../supabase';
import { getObjectText } from '../r2';

export interface DocumentContent {
  id: string;
  name: string;
  extractedText: string;
  subject: string | null;
  gradeLevel: string | null;
  sloTags: any[];
}

/**
 * Fetch selected documents for a user WITH actual content from R2
 */
export async function getSelectedDocumentsWithContent(
  userId: string
): Promise<DocumentContent[]> {
  try {
    // 1. Get selected document metadata from Supabase
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .eq('is_selected', true)
      .order('created_at', { ascending: false })
      .limit(3); // Context window limit

    if (error) {
      console.error('Error fetching document metadata:', error);
      return [];
    }

    if (!documents || documents.length === 0) return [];

    const documentsWithContent: DocumentContent[] = [];

    // 2. Fetch actual content from R2 or Supabase cache
    for (const doc of documents) {
      try {
        let extractedText = '';

        // Check if text is cached in Supabase
        if (doc.content_cached && doc.extracted_text) {
          extractedText = doc.extracted_text;
        }
        // Fetch from R2 using extracted_text_r2_key or main r2_key
        else {
          const key = doc.extracted_text_r2_key || doc.r2_key || doc.file_path;
          if (key) {
            extractedText = await getObjectText(key);
          }
        }

        if (extractedText) {
          // Truncate to avoid context overflow (max 5000 chars per doc)
          const truncatedText = extractedText.substring(0, 5000);
          
          documentsWithContent.push({
            id: doc.id,
            name: doc.name || doc.filename,
            extractedText: extractedText.length > 5000 
              ? truncatedText + '\n\n[Document truncated - showing first 5000 characters]'
              : truncatedText,
            subject: doc.subject,
            gradeLevel: doc.grade_level,
            sloTags: doc.slo_tags || []
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

  let context = "\n===========================================\n📚 ACTIVE CURRICULUM DOCUMENTS\n===========================================\n";

  for (const doc of documents) {
    context += `
📄 DOCUMENT: ${doc.name}
SUBJECT AREA: ${doc.subject || 'Not specified'}
GRADE LEVEL: ${doc.gradeLevel || 'Not specified'}
SLO TAGS: ${doc.sloTags.length > 0 ? JSON.stringify(doc.sloTags) : 'None extracted'}

DOCUMENT CONTENT:
${doc.extractedText}
-------------------------------------------
`;
  }

  context += `
🔴 CRITICAL INSTRUCTIONS FOR DOCUMENT-AWARE RESPONSES:
1. Analyze the document content provided above.
2. Reference specific information (SLO codes, outcomes) directly from these documents.
3. Quote relevant sections when answering curriculum-specific questions.
4. Use the format: "According to [document name], ..."
5. If information is NOT found in the documents, clearly state: "This information is not in the selected curriculum documents."
===========================================
`;

  return context;
}
