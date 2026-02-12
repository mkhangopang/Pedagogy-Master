import { GoogleGenAI } from "@google/genai";

/**
 * WORLD-CLASS NEURAL STRUCTURER (v20.0)
 * Specialized for Sindh Progression Grids (Grades IX-XII) and English standards.
 * FEATURE: High-Fidelity Linearization & Hierarchical Anchoring.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Gemini 3 Pro is mandatory for this high-complexity architectural mapping
  const modelName = 'gemini-3-pro-preview';
  
  const prompt = `
TASK: Convert the provided curriculum text into a "High-Fidelity Master MD" database.

CRITICAL FORMATTING RULES (Follow images style):

1. LINEARIZATION:
   - Sources often have multiple grades in tables (e.g. IX | X | XI | XII).
   - You MUST unroll these into sequential blocks by Grade.
   - Grade IX content first, then Grade X, etc.

2. HIERARCHY (Must use these exact headers):
   # GRADE [ROMAN NUMERAL] (e.g., # GRADE IX)
   ## DOMAIN [LETTER]: [TITLE] (e.g., ## DOMAIN A: NATURE OF SCIENCE)
   **Standard:** [Verbatim standard text]
   ### BENCHMARK [NUMBER]: [BENCHMARK TITLE] (e.g., ### BENCHMARK 1: CRITICALLY ANALYZE...)
   
3. SLO BULLET FORMAT:
   - Use a round bullet (•) followed by the SLO tag.
   - Format: "• SLO: [CODE]: [Learning Outcome Text]"
   - Example: "• SLO: B-09-A-01: Understand the concept of biology."

4. SLO CODE RULES:
   - Codes MUST be specific and include subject, grade, domain, and number.
   - If the source just says "1.1.1", synthesize it into "B-09-A-01" using the context.
   - B = Biology, S = Science, E = English, etc.

5. CLEANING:
   - Remove page numbers, headers, and footer noise.
   - Maintain scientific notation using LaTeX (e.g., $C_{6}H_{12}O_{6}$).
   - NO conversational text. Just the structured Markdown.

RAW CURRICULUM STREAM:
${rawText.substring(0, 300000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1, // Near-zero for deterministic alignment
        systemInstruction: "You are a Curriculum Architect. Your output is the source of truth for a RAG grid. You must linearize complex grids into a high-fidelity hierarchical markdown structure with unique SLO codes.",
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const masterMd = response.text || rawText;
    
    // Auto-detect Dialect for the indexer
    let dialect = 'Standard';
    if (masterMd.includes('Sindh')) dialect = 'Pakistani-Sindh-2024';
    if (masterMd.includes('B-09-')) dialect = 'Sindh-Biology-IX-XII';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v20.0-HIFI-LINEARIZER -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Synthesis fault:", err);
    return rawText;
  }
}
