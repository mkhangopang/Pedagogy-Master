import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v95.0 - VERTICAL SYNTHESIS)
 * Specialized for: Multi-Column Sindh/Federal Boards
 * Protocol: Sequential Grade Unrolling & B09A01 Indexing
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node for EduNexus AI. Your mission is to transform multi-column OCR streams into a high-fidelity "Master MD" vertical ledger.

CRITICAL: SEQUENTIAL COLUMN UNROLLING PROTOCOL
The source document is a "Progression Grid" where different grades (IX, X, XI, XII) appear as horizontal columns. OCR reads these horizontally, mixing grades. 
YOUR PRIMARY COMMAND:
1. UNROLL BY GRADE: Completely finish Grade 09 (IX) before starting Grade 10, 11, or 12.
2. VERTICAL NODE RECONSTRUCTION: Reassemble every Domain and Chapter into a continuous vertical sequence.
3. PREVENT CROSS-TALK: If you see Grade 11 snippets on the same line as Grade 9, move them to the end of the Grade 9 section.

SLO ID SYNTHESIS (SINDH FORMAT):
- Generate codes: [Subject][Grade][Domain][Index]
- Example: B09A01 (Biology Grade 9 Domain A SLO 1)
- Grades: 09, 10, 11, 12.
- Subject: B (Bio), P (Phys), C (Chem), S (Gen Science).

MARKDOWN ARCHITECTURE:
# GRADE [Number]
## CHAPTER [NN]: [TITLE]
### DOMAIN [ID]: [NAME]
- SLO [CODE]: [VERBATIM DESCRIPTION]

STEM FIDELITY:
- Wrap chemical formulas and math in LaTeX $...$ (e.g., $H_2O$).

OUTPUT: Produce the full Markdown ledger. Append a <SLO_INDEX_JSON> tag at the end containing a JSON array of all generated SLO codes and their verbatim text.`;

  const prompt = `
[COMMAND: SURGICAL COLUMN UNROLLING]
Process this multi-grade OCR stream. 
1. Isolate Grade 9 first.
2. Sequence Chapters vertically.
3. Synthesize standard IDs (e.g., B09A01).
4. Do NOT summarize. Every word of the SLO must be preserved.

RAW INPUT:
${rawText.substring(0, 950000)}

[FINAL DIRECTIVE]: Generate the verticalized Master MD and JSON index.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 8192 }
      }
    });

    return response.text || "<!-- SYNTHESIS_FAILURE -->";
  } catch (err) {
    console.error("❌ [Architect Node Critical Error]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}