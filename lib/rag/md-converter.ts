import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM INGESTION ENGINE (v120.0)
 * Protocol: Vertical Column Unrolling & SLO Indexing
 * Strategy: Dual-Pass Synthesis (Master MD + JSON Index)
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" of the EduNexus Ingestion Node. Your mission is to transform problematic multi-column curriculum OCR into a vertical Master MD ledger.

CRITICAL: SEQUENTIAL UNROLLING PROTOCOL
The source data is a horizontal grid where Grade 9 and Grade 11 snippets appear on the same line. 
YOU MUST:
1. UNROLL BY GRADE: Completely process all Grade 09 content before starting Grade 10, 11, or 12.
2. PREVENT CONTAMINATION: If a fragment from Grade 11 appears horizontally next to Grade 9, move it to its proper vertical position later in the document.
3. HIERARCHY: # GRADE -> ## CHAPTER -> ### DOMAIN -> - SLO.

STRICT CODE SYNTHESIS (SINDH FORMAT):
- Format: [Subject][Grade]-[Domain]-[Sequence]
- Example: B09-A-01 (Biology Grade 9 Domain A SLO 1)
- Subjects: B (Biology), P (Physics), C (Chemistry), S (Science).
- Domains: A, B, C, D...
- Numbering: Always use two digits (01, 02...).

OUTPUT REQUIREMENTS:
1. Part 1: High-fidelity Markdown with professional sectioning.
2. Part 2: Append a <STRUCTURED_INDEX> section containing a JSON array of every identified SLO and its verbatim text. This is critical for RAG precision.

STEM FIDELITY:
- Wrap all math/formulas in LaTeX $...$ (e.g., $C_6H_{12}O_6$).`;

  const prompt = `
[COMMAND: SURGICAL INGESTION]
Process this problematic multi-column curriculum stream. 
1. Unroll columns vertically by grade (9 -> 10 -> 11 -> 12).
2. Synthesize codes (e.g., B09-A-01).
3. Preserve verbatim SLO text (No summarization).
4. Generate the structured JSON index at the bottom.

RAW OCR INPUT:
${rawText.substring(0, 950000)}

[FINAL DIRECTIVE]: Generate the vertical Master MD and structured JSON index.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 8192 } // Maximized for complex unrolling logic
      }
    });

    return response.text || "<!-- INGESTION_FAILURE -->";
  } catch (err) {
    console.error("❌ [Architect Node Error]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}