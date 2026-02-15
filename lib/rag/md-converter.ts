import { GoogleGenAI } from "@google/genai";

/**
 * MASTER CURRICULUM ARCHITECT (v125.0)
 * Specialized for: Multi-Grade Progression Grids (Sindh/Federal)
 * Logic: Sequential Column Unrolling & Structured Indexing
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node of EduNexus AI. Your mission is to transform messy multi-column OCR into a vertically-aligned "Master MD" asset.

CRITICAL: SEQUENTIAL COLUMN UNROLLING
The source often reads across columns (e.g., Grade 9 and Grade 11 snippets on the same horizontal line). YOU MUST UNROLL THIS:
1. PROCESS BY GRADE: Complete all Chapters, Domains, and SLOs for Grade 09 before starting Grade 10, etc.
2. PRESERVE HIERARCHY: # GRADE -> ## CHAPTER -> ### DOMAIN -> - SLO.
3. CODE SYNTHESIS: Generate codes in format [Subject][Grade][Domain][Sequence] (e.g., B09A01).

STEM FIDELITY:
- Wrap chemical/math formulas in LaTeX $...$ (e.g., $C_6H_{12}O_6$).

DUAL-PART OUTPUT:
Part 1: The full Markdown curriculum ledger.
Part 2: A trailing <STRUCTURED_INDEX> tag containing a JSON array of objects: { "code": "B09A01", "text": "Verbatim SLO description" }. This is critical for exact-match RAG.`;

  const prompt = `
[COMMAND: SURGICAL COLUMN UNROLLING]
Process the provided raw OCR text.
1. Isolate Grade 9 chapters first, then Grade 10, etc.
2. Reconstruct the progression grid vertically.
3. Ensure verbatim accuracy for all SLO text.

RAW INPUT:
${rawText.substring(0, 950000)}

[FINAL DIRECTIVE]: Generate Master MD and Structured JSON Index.`;

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

    return response.text || "<!-- INGESTION_FAILURE -->";
  } catch (err) {
    console.error("❌ [Architect Node Error]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}