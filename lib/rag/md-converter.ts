
import { GoogleGenAI } from "@google/genai";

/**
 * WORLD-CLASS NEURAL STRUCTURER (v7.0)
 * Specialized for Multi-Grade Parallel Curriculum Grids (Sindh IX-XII).
 * FEATURE: Self-Correcting Ingestion Node.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // High-fidelity extraction requires a more powerful reasoning model
  // We use gemini-3-pro-preview for complex multi-column unrolling
  const modelName = 'gemini-3-pro-preview';
  
  const prompt = `
TASK: Convert the provided raw curriculum text into a high-fidelity hierarchical "Master MD" file.

DIAGNOSTIC CONTEXT:
The document is the "Sindh Biology Curriculum 2024 (Grades IX-XII)".
It contains "Progression Grids" where SLOs for different grades (IX, X, XI, XII) are listed in parallel columns.

RECONSTRUCTION PROTOCOL:
1. UNROLL COLUMNS: For every page/section, separate the text into Grade-specific blocks. 
   - Sections must start with "# GRADE IX", "# GRADE X", "# GRADE XI", or "# GRADE XII".
2. HIERARCHY MAPPING: Maintain the structure: Domain -> Standard -> Benchmark -> SLO.
3. SLO IDENTIFICATION: Every Student Learning Outcome must be exactly formatted:
   - SLO: [CODE]: [FULL VERBATIM TEXT]
4. NEURAL RECOVERY: If the provided OCR text is garbled, truncated, or incomplete for a specific SLO code (e.g., B-09-B-01), use your internal knowledge of the 2024 Sindh Biology Curriculum to provide the CORRECT and COMPLETE standard description.
5. NO GAPS: Do not output "Data not present" or "N/A" if the SLO exists in the 2024 standards. Use your power to reconstruct the full progression.
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
        systemInstruction: "You are a master curriculum engineer. You transform chaotic OCR text into structured pedagogical intelligence. You are an expert in Pakistani National (Sindh/Federal) standards.",
        // Increased thinking budget for the complex unrolling task
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const masterMd = response.text || rawText;
    
    // Dialect Identification Node
    let dialect = 'Pakistani National (Sindh/Federal)';
    if (masterMd.includes('AO1') || masterMd.includes('IGCSE')) dialect = 'Cambridge Assessment';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Neural extraction fault:", err);
    // Fallback to flash if pro fails or times out
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
