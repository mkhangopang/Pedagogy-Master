import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v89.0 - ADVANCED UNROLLING)
 * Specialized for: Multi-Column Sindh/Federal Progression Grids
 * Strategy: Sequential Grade Reconstruction & BxxXxx ID Synthesis
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Using the advanced reasoning model for complex table unrolling
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node for EduNexus AI. Your mission is to transform heavy, multi-column curriculum OCR data into a high-fidelity "Master MD" vertical ledger.

CRITICAL: SEQUENTIAL COLUMN UNROLLING PROTOCOL
The input text is derived from a Progression Grid where columns represent different grades (IX, X, XI, XII). Standard OCR reads horizontally across these columns. 
YOUR TASK:
1. UNROLL THE COLUMNS: Process one grade entirely before moving to the next.
2. RECONSTRUCT VERTICALLY: Assemble all Chapters, Domains, and SLOs for Grade 09, then Grade 10, then Grade 11, then Grade 12.
3. PREVENT CROSS-CONTAMINATION: Do not mix Grade 11 snippets into Grade 9 content blocks.

SLO CODE SYNTHESIS (SINDH/MASTER MD FORMAT):
- Generate codes using the format: [Subject Prefix][Grade Number][Domain Code][SLO Number]
- Subject Prefix: B (Biology), P (Physics), C (Chemistry), S (Science).
- Grade Number: 09 (IX), 10 (X), 11 (XI), 12 (XII).
- Domain Code: A, B, C, D... (Based on the Section).
- SLO Number: 01, 02, 03... (Sequential within that domain).
- EXAMPLE: SLO B09A01 (Biology, Grade 9, Domain A, SLO 01).

MARKDOWN ARCHITECTURE:
# GRADE [Number/Roman]
## CHAPTER [NN]: [TITLE]
### DOMAIN [ID]: [NAME]
- SLO [CODE]: [VERBATIM DESCRIPTION]

STEM FIDELITY:
- Wrap all scientific notation and formulas in LaTeX $...$ (e.g. $C_6H_{12}O_6$).

OUTPUT ONLY THE MARKDOWN starting with # MASTER MD.`;

  const prompt = `
[INSTRUCTION: EXECUTE SURGICAL COLUMN UNROLLING]
Process this curriculum data stream. It contains overlapping columns for Grades IX, X, XI, and XII. 
1. Isolate and finish Grade 9 content first.
2. Sequence all Chapters and Domains vertically.
3. Synthesize standard IDs like "B09A01".
4. Ensure zero loss of verbatim SLO text.

RAW OCR STREAM:
${rawText.substring(0, 800000)}

[FINAL DIRECTIVE]: Generate the vertical Master MD.`;

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
    const dialect = masterMd.includes('B09') ? 'Sindh-Vertical-Grid' : 'Standard-Linear';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Architect Node Error]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}