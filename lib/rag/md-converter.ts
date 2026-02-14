
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL NEURAL STRUCTURER (v40.0 - MASTER ARCHITECT)
 * Logic: Linearizes curriculum into high-fidelity "Master MD" with deep pedagogical metadata.
 * Feature: Surgical SLO Code Generation & Bloom's Taxonomy Alignment.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are a world-class Curriculum Architect and Pedagogy Master.
Your goal is to convert messy curriculum PDFs/OCR into a structured "Master MD" format.

CRITICAL ARCHITECTURE RULES:

1. 🏛️ HIERARCHY ENFORCEMENT:
   - # GRADE [NUM/ROMAN] (e.g., # GRADE XI)
   - ## DOMAIN [CODE]: [NAME] (e.g., ## DOMAIN J: HUMAN PHYSIOLOGY)
   - ### CHAPTER [NUM]: [TITLE] (e.g., ### CHAPTER 13: CIRCULATION)
   - #### SECTION [NUM]: [TITLE] (e.g., #### SECTION 13.1: COMPONENTS)

2. 🧬 SURGICAL SLO EXTRACTION:
   - Identify ALL learning outcomes. 
   - Generate unique codes if missing: [SUBJECT_INITIAL]-[GRADE]-[DOMAIN_CODE]-[CHAPTER]-[SEQUENCE] (e.g., B-11-J-13-01).
   - EACH SLO must be wrapped in a block exactly like this:

   <!-- SLO BLOCK START -->
   #### SLO: [CODE]
   **Text:** [Verbatim objective text]
   
   **Analysis:**
   - **Keywords:** [5-8 comma separated keywords]
   - **Cognitive Level:** [Bloom's Level]
   - **Bloom's Verbs:** [Specific action verbs]
   - **Difficulty:** [Foundational/Intermediate/Advanced]
   - **Topic:** [Specific sub-topic]

   **Context:**
   - **Prerequisites:** [Related earlier SLOs or concepts]
   - **Builds Toward:** [Next logical SLO]
   
   **Teaching Context:**
   - **Estimated Duration:** [Periods/Minutes]
   - **Teaching Strategies:** [2-3 high-impact strategies]
   - **Assessment Ideas:** [Brief formative check idea]
   
   **Metadata:**
   - **Code Generated:** [Yes/No]
   - **Sequence:** [Position in chapter]
   <!-- SLO BLOCK END -->

3. 🧹 CLEANUP & DE-MINGLE:
   - Remove headers, footers, page numbers, and prefaces.
   - Separate "mingled" text where headers and body text are fused.
   - Map every chapter to its correct parent domain and grade.

RESULT: A database-ready, RAG-optimized pedagogical masterpiece.`;

  const prompt = `
[MISSION: DEEP PEDAGOGICAL EXTRACTION]
Analyze the raw curriculum stream below. 
1. Map the Grade and Domain context (e.g., Chapter 13 in Sindh Biology is Grade XI, Domain J).
2. Group content logically by CHAPTER and SECTION.
3. Transform every bullet point into a detailed SLO block with rich metadata.

RAW CURRICULUM STREAM:
${rawText.substring(0, 450000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 4096 }
      }
    });

    const masterMd = response.text || rawText;
    
    // Auto-detect Dialect for registry
    let dialect = 'Standard';
    const lowerMd = masterMd.toLowerCase();
    if (lowerMd.includes('sindh')) dialect = 'Pakistani-Sindh-2024';
    else if (lowerMd.includes('cambridge')) dialect = 'Cambridge-International';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v40.0 -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Fault:", err);
    return rawText;
  }
}
