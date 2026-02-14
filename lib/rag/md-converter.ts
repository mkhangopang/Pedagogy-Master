import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v85.0 - SEQUENTIAL FIDELITY)
 * Specialized for: Sindh Biology 2019 / Natural Language SLOs
 * Logic: Strict sectional verticalization and hierarchical code synthesis.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node for EduNexus AI. Your mission is to transform messy OCR curriculum text into a structured, vertically aligned "Master MD" asset.

CRITICAL: SEQUENTIAL RECONSTRUCTION PROTOCOL
The input text for Sindh Biology 2019 is often mixed due to OCR reading columns horizontally. You MUST re-sort and unroll this into a linear progression.

RECONSTRUCTION RULES:
1. HIERARCHY (STRICT): 
   # GRADE [XI or XII]
   ## CHAPTER [NN]: [TITLE]
   ### DOMAIN: [Understanding / Skills / STS]
   - SLO: [SYNTHETIC_CODE]: [TEXT]

2. SLO SYNTHESIS & SEQUENCING:
   - Identify every bullet following "Student will:".
   - Generate a deterministic code: [SUB]-[GRADE]-[CH]-[DOMAIN_KEY]-[INDEX]
   - Example: BIO-XI-C01-U-01 (Biology, Grade XI, Ch 1, Understanding, SLO 1).
   - Domain Keys: U (Understanding), S (Skills), T (STS).
   - Chapter Keys: C01 through C27 as defined in the contents.
   - Indices MUST be sequential (01, 02, 03...) within each domain block.

3. CONTENT ISOLATION:
   - Complete ALL of Grade XI (Chapters 1-13) before starting Grade XII (Chapters 14-27).
   - Do NOT interleave content. If a page break splits a chapter, merge the text back together logically.
   - REMOVE ALL: page numbers (e.g., "129 | P a g e"), repeating headers, member lists, and aims/objectives lists. Focus ONLY on the Chapter-wise Learning Outcomes.

4. STEM FIDELITY:
   - Wrap all chemical symbols, formulas, and math in LaTeX $...$ (e.g., $CO_2$, $C_6H_{12}O_6$).

OUTPUT ONLY THE MARKDOWN starting with # MASTER MD.`;

  const prompt = `
[COMMAND: SURGICAL SEQUENTIAL RECONSTRUCTION]
Process the Sindh Biology 2019 curriculum text. 
1. Map out the Chapters sequentially (1-27).
2. Assign each "Student will:" bullet to its correct Chapter and Domain (Understanding vs Skills).
3. Assign a deterministic code like BIO-XI-C01-U-01 to every objective.
4. Ensure Grade XI and Grade XII are in distinct, non-interleaved blocks.

RAW INPUT STREAM:
${rawText.substring(0, 800000)}

[FINAL INSTRUCTION]: 
Generate the high-fidelity Master MD with perfect vertical alignment.
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
