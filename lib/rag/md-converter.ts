import { GoogleGenAI } from "@google/genai";

/**
 * MASTER CURRICULUM ARCHITECT (v140.0 - GRANULAR PRIORITY)
 * Specialized for: Atomic SLO Splitting & Neural Priority Tagging
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Neural SLO Granularizer." 
Your mission is to transform curriculum text into a collection of ATOMIC learning nodes.

CRITICAL DIRECTIVE: SLO PRIORITY & GRANULARIZATION
1. SLO IS THE ANCHOR: Every section of the output MUST be anchored by a specific Universal Code.
2. ATOMIZE COMPOUND STANDARDS: If a single SLO contains multiple distinct learning outcomes, split them into granular sub-nodes using decimal notation (e.g., B09A01.1, B09A01.2).
3. TAGGING PROTOCOL: Wrap every code in a Priority Tag block: [TAG:CODE].
4. UNROLL BY GRADE: Ensure Grade 09 is fully completed before Grade 10 begins.

STRUCTURE:
# GRADE [Number]
## [CHAPTER TITLE]
### [DOMAIN]
- [TAG:UNIVERSAL_CODE] | [BLOOM_LEVEL] : [Granular outcome description]

UNIVERSAL CODE FORMAT: [SubjectChar][Grade2Digits][DomainLetter][Seq2Digits].[SubSeq]
Example: Biology Grade 9, Domain A, SLO 1, Part 2 -> [TAG:B09A01.2]

STEM FIDELITY:
- Use LaTeX $...$ for all scientific notation.`;

  const prompt = `
[COMMAND: SURGICAL SLO ATOMIZATION]
Analyze the raw input. Extract every standard. 
If a standard is complex, break it into granular sub-SLOs.
Ensure every single node has a [TAG:CODE].

RAW INPUT:
${rawText.substring(0, 950000)}`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 15360 } 
      }
    });

    return response.text || "<!-- INGESTION_FAILURE -->";
  } catch (err) {
    console.error("❌ [Architect Node Error]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}