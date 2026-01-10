
import { supabase } from '../supabase';
import { getObjectText } from '../r2';
import { extractSLOCodes, createSLOIndex, SLOIndex, searchSLO } from './slo-extractor';

export interface DocumentIndex {
  documents: Array<{
    id: string;
    filename: string;
    content: string;
    sloIndex: SLOIndex;
  }>;
  combinedSLOIndex: SLOIndex;
  documentCount: number;
}

export async function fetchAndIndexDocuments(userId: string): Promise<DocumentIndex> {
  try {
    const { data: docMetadata, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .eq('is_selected', true)
      .order('last_accessed_at', { ascending: false })
      .limit(3);
    
    if (error || !docMetadata || docMetadata.length === 0) {
      return { documents: [], combinedSLOIndex: {}, documentCount: 0 };
    }
    
    const documents: DocumentIndex['documents'] = [];
    const combinedSLOIndex: SLOIndex = {};
    
    for (const meta of docMetadata) {
      try {
        let content = '';
        if (meta.extracted_text_r2_key) {
          content = await getObjectText(meta.extracted_text_r2_key);
        } else if (meta.r2_key) {
          content = await getObjectText(meta.r2_key);
        } else if (meta.extracted_text) {
          content = meta.extracted_text;
        }
        
        if (!content) continue;
        
        const extractedSLOs = extractSLOCodes(content);
        const sloIndex = createSLOIndex(extractedSLOs, meta.name || meta.filename);
        Object.assign(combinedSLOIndex, sloIndex);
        
        documents.push({
          id: meta.id,
          filename: meta.name || meta.filename,
          content: content.substring(0, 15000),
          sloIndex,
        });
      } catch (docError) {
        console.error(`Failed to process ${meta.filename}:`, docError);
      }
    }
    
    return { documents, combinedSLOIndex, documentCount: documents.length };
  } catch (error) {
    return { documents: [], combinedSLOIndex: {}, documentCount: 0 };
  }
}

export function buildDocumentAwarePrompt(
  userQuery: string,
  documentIndex: DocumentIndex
): { prompt: string; sloPreFetched: boolean } {
  if (documentIndex.documentCount === 0) return { prompt: userQuery, sloPreFetched: false };
  
  const sloCode = extractSLOCodeFromQuery(userQuery);
  if (sloCode) {
    const sloInfo = searchSLO(sloCode, documentIndex.combinedSLOIndex);
    if (sloInfo) {
      return {
        prompt: `Teacher asked about SLO ${sloCode}. Curriculm info:\n${sloInfo}\n\nTeacher Question: ${userQuery}`,
        sloPreFetched: true,
      };
    }
  }
  return { prompt: userQuery, sloPreFetched: false };
}

function extractSLOCodeFromQuery(query: string): string | null {
  const sloPatterns = [
    /\b([A-Z])(\d{1,2})([a-z])(\d{1,2})\b/,
    /\bSLO[-\s]?([A-Z])[-\s]?(\d{1,2})[-\s]?([a-z])[-\s]?(\d{1,2})\b/i,
  ];
  for (const pattern of sloPatterns) {
    const match = query.match(pattern);
    if (match) return match[0];
  }
  return null;
}
