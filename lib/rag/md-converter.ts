import { GoogleGenAI } from "@google/genai";

/**
 * WORLD-CLASS NEURAL STRUCTURER (v8.0)
 * Specialized for Multi-Grade Parallel Curriculum Grids.
 * FEATURE: Subject-Agnostic Self-Correcting Ingestion Node.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // High-fidelity extraction requires a more powerful reasoning model
  const modelName = 'gemini-3-pro-preview';
  
  const prompt = `
TASK: Convert the provided raw curriculum text into a high-fidelity hierarchical "Master MD" file.

RECONSTRUCTION PROTOCOL:
1. IDENTIFY IDENTITY: Determine the specific Board, Subject, and Grade levels from the provided text (e.g., Sindh English Language Curriculum 2024, Grades IX-XII).
2. UNROLL COLUMNS: For every page/section, separate the text into Grade-specific blocks. 
   - Sections must start with "# GRADE [ROMAN_NUMERAL]" or "# GRADE [NUMBER]".
3. HIERARCHY MAPPING: Maintain the structure: Domain/Competency -> Standard -> Benchmark -> SLO.
4. SLO IDENTIFICATION: Every Student Learning Outcome must be exactly formatted:
   - SLO: [CODE]: [FULL VERBATIM TEXT]
5. NEURAL RECOVERY: If the provided OCR text is garbled, truncated, or incomplete for a specific SLO code, use your internal knowledge of the specific regional curriculum to provide the CORRECT and COMPLETE standard description.
6. ATOMICITY: Ensure each SLO is a distinct bullet point for high-precision RAG chunking.

RAW TEXT DATA (CURRICULUM STREAM):
${rawText.substring(0, 250000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction: "You are a master curriculum engineer. You transform chaotic OCR text into structured pedagogical intelligence. You specialize in identifying and mapping National and Provincial standards (e.g., Sindh/Federal Pakistan, UK National).",
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const masterMd = response.text || rawText;
    
    // Dialect Identification Node
    let dialect = 'Standard Curriculum';
    if (masterMd.includes('Sindh') || masterMd.includes('Federal Board')) dialect = 'Pakistani National (Sindh/Federal)';
    if (masterMd.includes('AO1') || masterMd.includes('IGCSE')) dialect = 'Cambridge Assessment';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Neural extraction fault:", err);
    try {
      const fallbackRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { temperature: 0.1 }
      });
      return fallbackRes.text || rawText;
    } catch (e) {
      return rawText;
    }
  }
}