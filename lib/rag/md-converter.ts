
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v70.0 - CONTEXTUAL)
 * Specialized for: Sindh Board 2019 Protocol (Natural Language SLOs)
 * Logic: Detects 'Student will:' patterns and assigns virtual anchor codes.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node. Your mission is to transform OCR curriculum text into a structured "Master MD" library asset.

CRITICAL: NATURAL LANGUAGE SLO DETECTION
In documents like Sindh Biology 2019, objectives are often written as:
"Understanding: Student will: • Define biological molecules..."
"Skills: Student will: • Draw model diagrams..."

YOUR RECONSTRUCTION PROTOCOL:
1. HIERARCHY: Strictly follow Section -> Chapter -> Major Concept -> Domain (Understanding/Skills).
2. SLO ANCHORING: If a bullet point starts with or follows "Student will:", it IS an SLO. 
   - You MUST assign it a code if one isn't present.
   - Format: "- SLO: [GEN-CODE]: [DESCRIPTION]"
   - Example Virtual Code: BIO-XI-CH01-U-01 (Subject-Grade-Chapter-Domain-Index).
3. TEXT FIDELITY: Keep the original descriptions verbatim.
4. MARKDOWN TEMPLATE:
   # MASTER MD: [CURRICULUM TITLE]
   ---
   # GRADE [XI/XII]
   ## CHAPTER [N]: [TITLE]
   ### MAJOR CONCEPT: [TITLE]
   **Domain:** [Understanding/Skills]
   - SLO: [CODE]: [Verbatim Description] <!-- AI_META: {...} -->

5. NOISE SCRUBBING: Ignore page headers, footers (e.g. "Sindh Curriculum for Biology"), and member lists.
6. STEM SUPPORT: Ensure LaTeX $...$ for any chemical formulas or math.

OUTPUT ONLY THE MARKDOWN starting with # MASTER MD.`;

  const prompt = `
[COMMAND: SURGICAL PEDAGOGICAL EXTRACTION]
Analyze the provided document stream. Reconstruct it vertically. 
Identify all "Student will:" blocks and treat each bullet as a unique SLO. 
If the text is messy, use the headings to rebuild the logic.

RAW INPUT STREAM:
${rawText.substring(0, 600000)}

[FINAL INSTRUCTION]: 
Generate the high-fidelity Master MD with synthetic codes where necessary for searchability.
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
