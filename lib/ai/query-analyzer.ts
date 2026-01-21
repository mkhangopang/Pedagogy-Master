import { normalizeSLO, extractSLOCodes } from '../rag/slo-extractor';

/**
 * INTELLIGENT QUERY ANALYSIS (v3.0)
 * Determines what the user actually wants from the document.
 */

export interface QueryAnalysis {
  queryType: 'lookup' | 'teaching' | 'lesson_plan' | 'assessment' | 'differentiation' | 'general';
  complexityLevel: 'simple' | 'moderate' | 'complex';
  expectedResponseLength: 'short' | 'medium' | 'long';
  extractedSLO?: string;
  allSLOCodes: string[];
  keywords: string[];
  userIntent: string;
}

/**
 * Analyze user query to determine intent and expected response type
 */
export function analyzeUserQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();
  const keywords = extractKeywords(query);
  
  // Use the canonical extractor for precision
  const allSLOCodes = extractSLOCodes(query);
  const extractedSLO = allSLOCodes.length > 0 ? allSLOCodes[0] : undefined;
  
  // PATTERN 1: Simple SLO Lookup
  if (
    /what is slo|define slo|tell me about slo|explain slo|slo\s+[a-z0-9]+\s*\?/i.test(query) &&
    extractedSLO &&
    query.split(' ').length < 15
  ) {
    return {
      queryType: 'lookup',
      complexityLevel: 'simple',
      expectedResponseLength: 'short',
      extractedSLO,
      allSLOCodes,
      keywords,
      userIntent: 'User wants brief definition of SLO from curriculum document',
    };
  }
  
  // PATTERN 2: Full Lesson Plan Request
  if (
    /create.*lesson plan|full lesson|complete lesson|lesson plan for|develop.*lesson|design.*lesson/i.test(query)
  ) {
    return {
      queryType: 'lesson_plan',
      complexityLevel: 'complex',
      expectedResponseLength: 'long',
      extractedSLO,
      allSLOCodes,
      keywords,
      userIntent: 'User wants complete structured lesson plan',
    };
  }
  
  // PATTERN 3: Teaching Strategies
  if (
    /how to teach|teaching strategies|activities for|teach this|ways to teach|methods for teaching/i.test(query)
  ) {
    return {
      queryType: 'teaching',
      complexityLevel: 'moderate',
      expectedResponseLength: 'medium',
      extractedSLO,
      allSLOCodes,
      keywords,
      userIntent: 'User wants specific teaching strategies and activities',
    };
  }
  
  // PATTERN 4: Assessment Creation
  if (
    /quiz|test|assessment|questions for|mcq|exam|evaluate|worksheet/i.test(query)
  ) {
    return {
      queryType: 'assessment',
      complexityLevel: 'moderate',
      expectedResponseLength: 'medium',
      extractedSLO,
      allSLOCodes,
      keywords,
      userIntent: 'User wants quiz/test questions with answer key',
    };
  }
  
  // PATTERN 5: Differentiation
  if (
    /differentiate|struggling students|below grade|advanced students|scaffold|accommodation|modification/i.test(query)
  ) {
    return {
      queryType: 'differentiation',
      complexityLevel: 'moderate',
      expectedResponseLength: 'medium',
      extractedSLO,
      allSLOCodes,
      keywords,
      userIntent: 'User wants differentiation strategies for diverse learners',
    };
  }
  
  return {
    queryType: 'general',
    complexityLevel: 'moderate',
    expectedResponseLength: 'medium',
    extractedSLO,
    allSLOCodes,
    keywords,
    userIntent: 'General educational query',
  };
}

function extractKeywords(text: string): string[] {
  const stopWords = ['what', 'is', 'the', 'how', 'do', 'i', 'can', 'you', 'a', 'an', 'to', 'for', 'in', 'on'];
  const words = text.toLowerCase().split(/\s+/);
  
  return words
    .filter(word => word.length > 3 && !stopWords.includes(word))
    .slice(0, 5);
}