
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL NEURAL STRUCTURER (v31.0 - MASTER ARCHITECT)
 * Logic: Linearizes curriculum into standard Markdown with deep hierarchy enforcement.
 * Feature: Surgical SLO Code Generation & Pedagogical Metadata Injection.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are a world-class Curriculum Architect and Pedagogy Master. 
Your goal is to convert messy curriculum PDFs into a "Master MD" format for high-fidelity RAG indexing.

CRITICAL RULES FOR "MASTER MD" OUTPUT:

1. 🏛️ STRICT HIERARCHY ENFORCEMENT:
   - # GRADE [ROMAN/NUM] (e.g., # GRADE XI)
   - ## DOMAIN [CODE]: [NAME] (e.g., ## DOMAIN J: HUMAN PHYSIOLOGY)
   - ### CHAPTER [NUM]: [TITLE] (e.g., ### CHAPTER 13: CIRCULATION)
   - #### SECTION [NUM]: [TITLE] (e.g., #### SECTION 13.1: COMPONENTS)

2. 🧬 SLO GENERATION & EXTRACTION:
   - Identify ALL learning outcomes (bullet points, table rows).
   - If explicit SLO codes are missing, GENERATE THEM using: [SUBJECT_INITIAL]-[GRADE]-[DOMAIN_CODE]-[CHAPTER]-[SEQUENCE] 
   - Example generated code: B-11-J-13-01
   - Format each SLO exactly like this:
     
     <!-- SLO BLOCK START -->
     #### SLO: [CODE]
     **Text:** [Verbatim Learning Outcome]
     **Analysis:**
     - **Keywords:** [5-8 comma separated keywords]
     - **Cognitive Level:** [Bloom's Level: Remember, Understand, Apply, Analyze, Evaluate, Create]
     - **Bloom's Verbs:** [The action verbs used in the text]
     - **Difficulty:** [Foundational, Intermediate, Advanced]
     - **Topic:** [Specific sub-topic name]
     <!-- SLO BLOCK END -->

3. 🧠 LOGICAL RESTRUCTURING:
   - Separate Grade levels clearly if multiple exist in the document (e.g. IX vs XI).
   - Map every chapter to its correct parent domain.
   - Fix "mingled" text where newlines are missing between headers and body text.
   - Remove administrative noise (prefaces, page numbers, generic footers).

4. 🧪 STEM INTEGRATION:
   - Wrap ALL mathematical or chemical notation in LaTeX $...$ or $$...$$.

RESULT: A structured, metadata-rich pedagogical document ready for surgical retrieval.`;

  const prompt = `
[MISSION: SURGICAL CURRICULUM EXTRACTION]
Process the raw text stream below. 
1. Identify the Grade level for each section (Chapter 13 in Sindh Bio is Grade XI).
2. Group content into DOMAINS and CHAPTERS based on the board's structure.
3. Extract every bullet point as a structured SLO block. Generate codes if missing.

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
        thinkingConfig: { thinkingBudget: 4096 }
      }
    });

    const masterMd = response.text || rawText;
    
    // Auto-detect Dialect
    let dialect = 'Standard';
    const lowerMd = masterMd.toLowerCase();
    if (lowerMd.includes('sindh')) dialect = 'Pakistani-Sindh-2024';
    else if (lowerMd.includes('cambridge')) dialect = 'Cambridge-International';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v31.0 -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Fault:", err);
    return rawText;
  }
}
