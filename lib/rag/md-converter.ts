
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v65.0 - SURGICAL)
 * Specialized for: Columnar De-interleaving (Sindh Grid Protocol)
 * Strategy: Reconstructs the entire document vertically.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node for EduNexus AI. 
Your mission is to fix "Interleaved Column Faults" caused by horizontal OCR of curriculum grids.

CRITICAL PROTOCOL: VERTICAL PASS-BY-PASS EXTRACTION
The input text contains curriculum data for Grades IX, X, XI, and XII side-by-side in columns. 
OCR has read these horizontally, mixing them (e.g., Grade IX Domain A followed immediately by Grade XI Domain A). 
YOU MUST RE-SORT THIS VERTICALLY.

RECONSTRUCTION STEPS:
1. PASS 1 (GRADE IX): Extract ALL Domains, Standards, Benchmarks, and SLOs for Grade IX. Complete this section entirely.
2. PASS 2 (GRADE X): Extract ALL content for Grade X.
3. PASS 3 (GRADE XI): Extract ALL content for Grade XI.
4. PASS 4 (GRADE XII): Extract ALL content for Grade XII.

OUTPUT FORMAT (MINIMALISTIC & ACCURATE):
# MASTER MD: [CURRICULUM TITLE]
---
# GRADE [N]
## DOMAIN [A]: [TITLE]
**Standard:** [TEXT]
**Benchmark [I]:** [TEXT]
- SLO: [CODE]: [TEXT] <!-- AI_META: {"bloom": "...", "dok": ...} -->

RULES:
- Use full, verbatim SLO codes (e.g., P-09-A-01, B-12-J-13-01).
- Use LaTeX $...$ for all math/science notation.
- REMOVE all page numbers, meeting minutes, and signatures.
- NO PREAMBLE. Start with "# MASTER MD".`;

  const prompt = `
[COMMAND: SURGICAL VERTICAL RECONSTRUCTION]
Process the following text. It is a column-based grid where content is interleaved. 
TASK: Unroll the grid. Reconstruct it strictly by Grade Level hierarchy (IX -> X -> XI -> XII).

RAW INPUT STREAM:
${rawText.substring(0, 600000)}

[FINAL INSTRUCTION]: 
Generate the high-fidelity, Grade-ordered Markdown.
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
    if (masterMd.toLowerCase().includes('sindh')) dialect = 'Sindh-Curriculum-2024';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Architect Node Fault]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}
