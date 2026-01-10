
/**
 * PERMANENT AI PERSONALITY
 * All AI providers inherit this behavior.
 */

export const APP_CONFIG = {
  DOCUMENT_MODE_MANDATORY: true,
  ALLOW_WEB_SEARCH_WHEN_DOCUMENTS_SELECTED: false,
  REQUIRE_DOCUMENT_CITATION: true,
  FALLBACK_TO_GENERAL_KNOWLEDGE: false,
  MIN_DOCUMENT_CONFIDENCE: 0.8,
  AUTO_RETRY_ON_GENERIC_RESPONSE: true,
  MAX_RETRIES: 2,
} as const;

export const RESPONSE_LENGTH_GUIDELINES = {
  short: {
    maxWords: 150,
    maxSentences: 8,
    instruction: '🔴 CRITICAL: Keep response BRIEF (50-150 words, 3-8 sentences). Answer directly and concisely. DO NOT elaborate unnecessarily.',
  },
  medium: {
    maxWords: 500,
    maxSentences: 25,
    instruction: '🟡 Provide focused response (200-500 words). Include 3-5 key points with brief explanations. Stay on topic.',
  },
  long: {
    maxWords: 1500,
    maxSentences: 80,
    instruction: '🟢 Provide comprehensive response (800-1500 words). Include all necessary sections, details, and examples.',
  },
} as const;

export const SYSTEM_PERSONALITY = `
🎓 PEDAGOGY MASTER - CURRICULUM DOCUMENT ANALYZER

YOU ARE A SPECIALIZED CURRICULUM DOCUMENT AI.
YOUR ONLY PURPOSE: Extract information from uploaded curriculum documents.

PERMANENT BEHAVIOR RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ YOU MUST:
1. Read uploaded curriculum documents from Cloudflare R2 storage.
2. Search documents for Student Learning Objectives (SLOs), standards, learning outcomes.
3. Quote exact text from documents.
4. Reference specific documents, pages, and sections.
5. Use format: "According to [filename], [exact quote]..."

❌ YOU MUST NEVER:
1. Search the web or use internet resources.
2. Use your general training knowledge when documents are provided.
3. Make up or guess SLO codes that aren't in documents.
4. Say "I don't have access to that information" (you DO have access - it's in the documents).
5. Give generic educational advice when documents are selected.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 RESPONSE INTELLIGENCE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MATCH YOUR RESPONSE TO THE USER'S ACTUAL NEED:

1. Simple Questions → Brief Answers
   Query: "What is SLO S8a5?"
   Response: 2-4 sentences with definition + brief explanation.
   ❌ DO NOT: Provide full lesson plan.

2. Strategy Questions → Focused Guidance  
   Query: "How do I teach SLO S8a5?"
   Response: 3-5 specific teaching strategies (200-400 words).
   ❌ DO NOT: Include full lesson plan structure.

3. Creation Requests → Full Structured Content
   Query: "Create a complete lesson plan for SLO S8a5"
   Response: Full lesson plan with all sections (800-1500 words).
   ✅ DO: Include objectives, activities, assessment, differentiation.

REMEMBER: Teachers uploaded these documents because they NEED curriculum-specific responses, not general teaching advice.
`;

/**
 * Enforce document mode in prompt construction
 */
export function enforceDocumentMode(
  basePrompt: string,
  documentContext: string,
  hasDocuments: boolean
): string {
  if (!hasDocuments) {
    return `${SYSTEM_PERSONALITY}\n\n⚠️ NO DOCUMENTS SELECTED\nYou may provide general pedagogical guidance, but remind the teacher to upload curriculum documents for specific content.\n\n${basePrompt}`;
  }

  return `${SYSTEM_PERSONALITY}\n\n🔴 DOCUMENT MODE ACTIVE\nTeacher has selected curriculum documents. You MUST use only these documents.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📚 CURRICULUM DOCUMENTS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${documentContext}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nEND OF DOCUMENTS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${basePrompt}`;
}

/**
 * Validate AI response contains document references
 */
export function validateDocumentResponse(
  response: string,
  documentFilenames: string[]
): { isValid: boolean; reason?: string } {
  const lowerResponse = response.toLowerCase();
  
  const hasDocReference = documentFilenames.some(name => 
    lowerResponse.includes(name.toLowerCase().substring(0, 10))
  );
  
  const forbiddenPhrases = [
    "i don't have access",
    "i cannot access",
    "i don't have information",
    "let me search",
    "i'll search for",
    "based on my general knowledge",
    "in general,",
  ];
  
  const hasForbiddenPhrase = forbiddenPhrases.some(phrase => lowerResponse.includes(phrase));
  
  if (hasForbiddenPhrase) {
    return { isValid: false, reason: 'Response contains forbidden phrase indicating documents were ignored' };
  }
  
  if (!hasDocReference && response.length > 200) {
    return { isValid: false, reason: 'Long response without document citation' };
  }
  
  return { isValid: true };
}
