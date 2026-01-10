
/**
 * INTELLIGENT QUERY ANALYSIS
 * Determines what the user actually wants from the document.
 */

export interface QueryAnalysis {
  queryType: 'lookup' | 'teaching' | 'lesson_plan' | 'assessment' | 'differentiation' | 'general';
  complexityLevel: 'simple' | 'moderate' | 'complex';
  expectedResponseLength: 'short' | 'medium' | 'long';
  extractedSLO?: string;
  keywords: string[];
  userIntent: string;
}

/**
 * Analyze user query to determine intent and expected response type
 */
export function analyzeUserQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();
  const keywords = extractKeywords(query);
  const extractedSLO = extractSLOCode(query);
  
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
      keywords,
      userIntent: 'User wants differentiation strategies for diverse learners',
    };
  }
  
  return {
    queryType: 'general',
    complexityLevel: 'moderate',
    expectedResponseLength: 'medium',
    extractedSLO,
    keywords,
    userIntent: 'General educational query',
  };
}

function extractSLOCode(query: string): string | undefined {
  const patterns = [
    /\b([A-Z])(\d{1,2})([a-z])(\d{1,2})\b/,
    /\bSLO[-\s]?([A-Z])[-\s]?(\d{1,2})[-\s]?([a-z])[-\s]?(\d{1,2})\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) return match[0];
  }
  
  return undefined;
}

function extractKeywords(query: string): string[] {
  const stopWords = ['what', 'is', 'the', 'how', 'do', 'i', 'can', 'you', 'a', 'an', 'to', 'for', 'in', 'on'];
  const words = query.toLowerCase().split(/\s+/);
  
  return words
    .filter(word => word.length > 3 && !stopWords.includes(word))
    .slice(0, 5);
}
