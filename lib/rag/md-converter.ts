import { GoogleGenAI } from "@google/genai";

/**
 * MASTER CURRICULUM ARCHITECT (v130.0)
 * Specialized for: Universal Multi-Grade Progression Grids
 * Logic: STRICT Sequential Column Unrolling & Universal Code Synthesis
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Universal Curriculum Architect" node of EduNexus AI. 
Your mission is to transform messy multi-column OCR text into a vertically-aligned "Master MD" asset.

CRITICAL DIRECTIVE: SEQUENTIAL GRADE UNROLLING
1. DO NOT process text horizontally across columns. 
2. ISOLATE GRADES: Find all content for Grade 09 first, then Grade 10, etc.
3. RECONSTRUCT HIERARCHY: 
   # GRADE [Number]
   ## CHAPTER [Number]: [Title]
   ### DOMAIN [Letter]: [Title]
   - SLO [CODE]: [Verbatim Description]

UNIVERSAL CODE FORMAT (STRICT ENFORCEMENT):
Generate/Normalize every SLO code into a 6-character identifier: [SubjectChar][Grade2Digits][DomainLetter][Seq2Digits]
Examples:
- Biology Grade 9, Domain A, SLO 1 -> B09A01
- Physics Grade 11, Domain C, SLO 12 -> P11C12
- Chemistry Grade 10, Domain B, SLO 5 -> C10B05

STEM FIDELITY:
- Wrap all scientific/math notation in LaTeX $...$ (e.g., $C_6H_{12}O_6$).

DUAL-PART OUTPUT FORMAT:
Part 1: The full Markdown curriculum ledger organized by GRADE.
Part 2: A trailing <STRUCTURED_INDEX> tag containing a JSON array of objects: 
{ "code": "B09A01", "grade": "09", "subject": "Biology", "domain": "A", "text": "Verbatim description" }.`;

  const prompt = `
[COMMAND: SURGICAL GRADE EXTRACTION]
Process the raw input below. Unroll the columns. 
Group everything by Grade first. 
Standardize all codes to the [Subject][Grade][Domain][Seq] format.

RAW INPUT:
${rawText.substring(0, 950000)}

[FINAL DIRECTIVE]: Generate Master MD with Structured JSON Index.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 12288 } 
      }
    });

    return response.text || "<!-- INGESTION_FAILURE -->";
  } catch (err) {
    console.error("❌ [Architect Node Error]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}