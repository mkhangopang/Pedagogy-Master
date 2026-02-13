
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL NEURAL STRUCTURER (v30.0 - MASTER ARCHITECT)
 * Logic: Linearizes curriculum into standard Markdown with deep hierarchy enforcement.
 * Feature: Code Generation for missing SLOs & Semantic Restructuring.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are a world-class Curriculum Architect.
Your goal is to convert raw, messy curriculum PDFs into a "Master MD" format that is beautiful, logical, and readable.

CRITICAL RULES FOR "MASTER MD" OUTPUT:

1. 🏛️ STRICT HIERARCHY ENFORCEMENT:
   - # GRADE [ROMAN/NUM] (e.g., # GRADE XI)
   - ## DOMAIN [CODE]: [NAME] (e.g., ## DOMAIN J: HUMAN PHYSIOLOGY)
   - ### CHAPTER [NUM]: [TITLE] (e.g., ### CHAPTER 13: CIRCULATION)
   - #### SECTION [NUM]: [TITLE] (e.g., #### SECTION 13.1: COMPONENTS)

2. 🧬 SLO GENERATION & EXTRACTION:
   - Identify ALL learning outcomes (bullet points, table rows).
   - If explicit SLO codes are missing, **GENERATE THEM** using the pattern: [SUBJECT]-[GRADE]-[DOMAIN]-[CHAPTER]-[NUMBER] (e.g., B-11-J-13-01).
   - Format each SLO exactly like this:
     
     <!-- SLO BLOCK START -->
     #### SLO: [CODE]
     **Text:** [Verbatim Learning Outcome]
     **Cognitive Level:** [Bloom's Taxonomy Level]
     **Keywords:** [Comma separated keywords]
     <!-- SLO BLOCK END -->

3. 🧠 LOGICAL RESTRUCTURING:
   - If the document has a "Progression Grid" separate from "Detailed Content", prioritize the detailed content chapters but integrate the grid's metadata if possible.
   - **Grade Mapping:** If the document covers multiple grades (IX-XII), carefully assign chapters to the correct grade based on the Table of Contents or context (e.g., Chapter 13 might be Grade XI).
   - **Deduplication:** Remove repetitive "Table of Contents" lists; focus on the instructional content.

4. 🧹 CLEANUP:
   - Remove headers/footers, page numbers, and administrative prefaces.
   - Fix "mingled" text where newlines are missing between headers and body.

RESULT: A structured, database-ready pedagogical document.`;

  const prompt = `
[MISSION: DEEP CURRICULUM EXTRACTION]
Process the raw text stream below.
1. Detect Grade Levels (e.g., IX, X, XI, XII).
2. Group content by DOMAIN and CHAPTER.
3. Extract every single learning outcome as a structured SLO block.

RAW TEXT STREAM:
${rawText.substring(0, 400000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 4096 } // Maximize reasoning for structure
      }
    });

    const masterMd = response.text || rawText;
    
    // Auto-detect Dialect for the indexer
    let dialect = 'Standard';
    const lowerMd = masterMd.toLowerCase();
    if (lowerMd.includes('sindh')) dialect = 'Pakistani-Sindh-2024';
    if (lowerMd.includes('cambridge')) dialect = 'Cambridge-International';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v30.0 -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Fault:", err);
    return rawText;
  }
}
