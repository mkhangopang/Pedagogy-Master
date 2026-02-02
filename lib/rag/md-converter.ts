import { GoogleGenAI } from "@google/genai";

/**
 * WORLD-CLASS NEURAL STRUCTURER (v4.0)
 * Specialized for Pakistani National Curriculum (Sindh/Federal) and International (IB/CIE) grids.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
TASK: Convert the following scrambled OCR/PDF text into a high-fidelity "Master MD" file.
You are a specialist in Curriculum Data Architecture.

CRITICAL LOGIC FOR PROGRESSION GRIDS:
The text often has Grade IX, X, XI, and XII objectives scrambled together because of PDF columns. 
You MUST re-associate each SLO code with its correct grade and description.

FORMATTING RULES:
1. DOMAINS: Use # [DOMAIN NAME] (e.g., # Domain B: Molecular Biology).
2. STANDARDS: Use ## Standard: [Description].
3. BENCHMARKS: Use ### Benchmark [Number]: [Description].
4. ATOMIC SLOs: Every Learning Objective MUST follow this pattern:
   - SLO: [CODE]: [DESCRIPTION]
   Example: - SLO: B-11-B-01: Define biochemistry and molecular biology.
5. CLEANING: Remove page numbers, footers, headers, and Table of Contents.
6. CONTINUITY: If a description is cut off, use your logic to complete it or join the text fragments.

RAW DATA STREAM:
${rawText.substring(0, 48000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.1,
        systemInstruction: "Strictly output structured Markdown for RAG injection. Do not include chat filler.",
      }
    });

    const masterMd = response.text || rawText;
    
    // Auto-detect dialect for synthesis context
    let dialect = 'Standard Global';
    if (masterMd.includes('SLO') && (masterMd.includes('B-') || masterMd.includes('S-'))) dialect = 'Pakistani National (Sindh/Federal)';
    if (masterMd.includes('AO1') || masterMd.includes('IGCSE')) dialect = 'Cambridge Assessment';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Structuring fault:", err);
    return rawText; 
  }
}