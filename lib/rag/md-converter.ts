import { GoogleGenAI } from "@google/genai";

/**
 * NEURAL MARKDOWN STRUCTURER (v1.0)
 * Logic: Meshy PDF Soup -> Pedagogical Markdown Grid.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
TASK: Convert the following messy OCR/PDF text into a structured Markdown Curriculum Progression Grid.

FORMAT RULES:
1. Identify DOMAINS as # H1 Headers.
2. Identify STANDARDS as ## H2 Headers.
3. Identify BENCHMARKS as ### H3 Headers.
4. IMPORTANT: Format every Student Learning Objective (SLO) exactly like this:
   - SLO: [CODE]: [FULL VERBATIM DESCRIPTION]
   Example: - SLO: B-11-B-27: Describe the structure and function of RNA.

5. Do not skip any codes. If a table has multiple grades, list them sequentially.
6. Remove all headers, footers, page numbers, and redundant institutional logos.

MESSY TEXT:
${rawText.substring(0, 45000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.1, // High precision
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    return response.text || rawText;
  } catch (err) {
    console.error("❌ [MD Converter] Neural structuring failed:", err);
    return rawText; // Fallback to raw if AI fails
  }
}