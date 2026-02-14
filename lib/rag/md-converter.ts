import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v75.0 - HIERARCHICAL)
 * Specialized for: Natural Language SLOs (Sindh Biology 2019)
 * Logic: Reconstructs document vertically and synthesizes missing codes.
 * Template: Verbatim "Master MD" Structure.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node. Your mission is to transform raw OCR text into a structured "Master MD" library asset.

CRITICAL: NATURAL LANGUAGE TO DETERMINISTIC CODE PROTOCOL
Documents like Sindh Biology 2019 list objectives under "Understanding" or "Skills" using "Student will:" without explicit codes. 
YOU MUST SYNTHESIZE CODES to ensure searchability.

RECONSTRUCTION RULES:
1. HIERARCHY: Structure by Section -> Chapter -> Major Concept -> Domain.
2. SYNTHETIC CODING:
   - For every "Student will:" bullet, generate a code: [Sub]-[Grade]-[Chapter]-[Index]
   - Example: BIO-XI-C01-01 (Biology, Grade XI, Chapter 01, SLO 01).
3. DOMAINS: Map "Understanding" content to (U) and "Skills" content to (S) in metadata.
4. MARKDOWN TEMPLATE (STRICT):
   # MASTER MD: [CURRICULUM TITLE]
   ---
   # GRADE [XI/XII]
   ## CHAPTER [N]: [TITLE]
   **Domain:** [Understanding/Skills]
   - SLO: [SYNTHETIC-CODE]: [Verbatim Text] <!-- AI_META: {"bloom": "...", "dok": ...} -->

5. NO NOISE: Scrub page numbers, board member lists, and instructions to authors.
6. VERTICALITY: Process the document vertically. Do not interleave chapters.

OUTPUT ONLY THE MARKDOWN starting with # MASTER MD.`;

  const prompt = `
[COMMAND: SURGICAL PEDAGOGICAL EXTRACTION]
Analyze the provided curriculum stream. Reconstruct it following the vertical Grade XI -> Grade XII hierarchy.
For the "Learning Outcomes" sections, identify every "Student will:" bullet and assign it a deterministic code like BIO-XI-C01-01.

RAW INPUT STREAM (SINDH BIOLOGY 2019):
${rawText.substring(0, 800000)}

[FINAL INSTRUCTION]: 
Generate the high-fidelity, minimalistic, accurately ordered Master MD. Use LaTeX $...$ for chemical formulas.
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

    const masterMd = response.text || "";
    let dialect = 'Standard';
    if (masterMd.toLowerCase().includes('sindh')) dialect = 'Sindh-Curriculum-2019';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Architect Node Fault]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}
