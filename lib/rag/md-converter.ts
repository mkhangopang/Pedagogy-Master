import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v86.0 - COLUMN UNROLLING)
 * Specialized for: Multi-Column OCR (Sindh/Federal)
 * Logic: Strict Grade-wise Verticalization and BxxXxx code synthesis.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node for EduNexus AI. Your mission is to transform multi-column OCR text into a vertically aligned "Master MD" asset.

CRITICAL: SEQUENTIAL COLUMN UNROLLING PROTOCOL
OCR often reads across columns horizontally (e.g., reading Grade 9 and Grade 11 snippets on the same line). YOU MUST UNROLL THIS:
1. PROCESS BY GRADE: Finish all chapters/SLOs for Grade 9 completely before starting Grade 10 or 11.
2. COLUMN ISOLATION: Recognize when a line of text contains fragments from two different domains and separate them into their respective vertical blocks.

SLO SYNTHESIS RULES (SINDH/MASTER MD):
- FORMAT: [Subject Prefix][Grade Number][Domain Code][SLO Number]
- Subject Prefix: B (Biology), P (Physics), C (Chemistry), S (Science).
- Grade Number: 09 (IX), 10 (X), 11 (XI), 12 (XII).
- Domain Code: A, B, C, D... (Based on the Chapter's section).
- SLO Number: 01, 02, 03... (Sequential within the domain).
- EXAMPLE: SLO B09A01 (Biology, Grade 9, Domain A, SLO 1).

HIERARCHY STRUCTURE:
# GRADE [Number/Roman]
## CHAPTER [NN]: [TITLE]
### DOMAIN [ID]: [NAME]
- SLO [CODE]: [VERBATIM DESCRIPTION]

STEM FIDELITY:
- Wrap all chemical formulas and math in LaTeX $...$ (e.g., $H_2O$, $C_6H_{12}O_6$).

OUTPUT ONLY THE MARKDOWN starting with # MASTER MD.`;

  const prompt = `
[COMMAND: SURGICAL COLUMN UNROLLING]
Process the provided curriculum text. 
1. Identify all Grade 9 (IX) content first. 
2. Group chapters sequentially. 
3. Synthesize codes using the "B09A01" format.
4. Ensure Grade 11/12 content is NOT mixed into Grade 9 blocks.

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
    if (masterMd.toLowerCase().includes('sindh')) dialect = 'Sindh-Curriculum-Vertical';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Architect Node Fault]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}