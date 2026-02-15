import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v92.0 - COLUMN UNROLLING)
 * Specialized for: Multi-Column OCR (Sindh/Federal Boards)
 * Strategy: Vertical Grade-Node Reconstruction & B09A01 ID Synthesis
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node for EduNexus AI. Your mission is to transform multi-column OCR streams into a vertically-aligned "Master MD" asset.

CRITICAL: SEQUENTIAL COLUMN UNROLLING PROTOCOL
OCR data for curriculum grids often reads across columns (e.g., Reading Grade 9 and Grade 11 snippets on the same line). YOU MUST UNROLL THIS:
1. PROCESS BY GRADE: Complete all Chapters, Domains, and SLOs for Grade 09 entirely before moving to Grade 10, 11, or 12.
2. COLUMN ISOLATION: Recognize when text fragments belong to different vertical domains and re-order them into their correct hierarchical sequence.
3. HIERARCHY: # GRADE -> ## CHAPTER -> ### DOMAIN -> - SLO.

SLO SYNTHESIS RULES (SINDH/MASTER MD FORMAT):
- FORMAT: [Subject Prefix][Grade Number][Domain Code][SLO Number]
- Subject Prefix: B (Biology), P (Physics), C (Chemistry), S (Science).
- Grade Number: 09 (IX), 10 (X), 11 (XI), 12 (XII).
- Domain Code: A, B, C, D... (Based on the Section/Chapter).
- SLO Number: 01, 02, 03... (Sequential within the domain).
- EXAMPLE: SLO B09A01 (Biology, Grade 9, Domain A, SLO 1).

STEM FIDELITY:
- Wrap all chemical formulas, symbols, and math in LaTeX $...$ (e.g., $H_2O$, $C_6H_{12}O_6$).

OUTPUT ONLY THE MARKDOWN starting with # MASTER MD.`;

  const prompt = `
[COMMAND: SURGICAL COLUMN UNROLLING]
Process the provided raw OCR text which contains multi-grade columns.
1. Isolate and finish all Grade 9 (IX) content first. 
2. Group all chapters sequentially for Grade 9.
3. Use the "B09A01" ID format.
4. Ensure Grade 11/12 content is NOT interleaved into Grade 9 blocks.
5. Verbatim Accuracy: Do not summarize; the SLO text must be preserved.

RAW OCR INPUT:
${rawText.substring(0, 900000)}

[FINAL DIRECTIVE]: Generate the verticalized Master MD ledger.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 8192 } // Increased for complex unrolling
      }
    });

    const masterMd = response.text || "";
    const dialect = masterMd.includes('B09') ? 'Sindh-Vertical-Grid' : 'Standard-Linear';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Architect Node Critical Error]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}