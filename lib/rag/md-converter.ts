import { GoogleGenAI } from "@google/genai";

/**
 * WORLD-CLASS NEURAL STRUCTURER (v12.0)
 * Specialized for Multi-Grade Parallel Curriculum Grids and International Standards.
 * FEATURE: Hierarchical Unrolling & Contextual Breadboarding.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Use Gemini 3 Pro for high-fidelity structural reconstruction
  const modelName = 'gemini-3-pro-preview';
  
  const prompt = `
TASK: Convert the provided raw curriculum OCR text into a high-fidelity "Master MD" file. 

STRICT RECONSTRUCTION PROTOCOL:
1. IDENTIFY GRID STRUCTURE: Curriculum documents often use tables to show progression across grades (e.g., Grade IX, X, XI in columns). You MUST linearize this. 
   - Instead of Grade IX... Grade X... in one row, create separate sections for each Grade.
2. HIERARCHY INJECTION: For EVERY section, you must maintain the breadcrumb: # GRADE > ## DOMAIN > ### STANDARD > #### BENCHMARK.
3. SLO ANCHORING: Every Student Learning Outcome MUST be formatted as:
   - SLO: [CODE]: [VERBATIM TEXT]
   - Example: SLO: B-11-A-01: Identify parts of a cell.
4. TYPO RECOVERY: If the OCR shows "SL0" instead of "SLO", or "8.l.2" instead of "8.1.2", use your internal pedagogical logic to RESTORE the correct code based on the regional curriculum (Sindh, Federal, IGCSE, etc.).
5. MULTIMODAL CONTEXT: If the text describes a diagram (e.g., "Figure 1: Cell Structure"), explicitly note it as [DIAGRAM: Cell Structure] in the text to help the RAG retriever.

RAW CURRICULUM STREAM:
${rawText.substring(0, 200000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1, // Near-zero for deterministic structural integrity
        systemInstruction: "You are a World-Class Curriculum Engineer. Your output is used to train neural vector databases. Accuracy is life-critical.",
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const masterMd = response.text || rawText;
    
    // Auto-detect Curriculum Dialect for Metadata
    let dialect = 'Standard';
    if (masterMd.includes('Sindh') || masterMd.includes('B-09')) dialect = 'Pakistani-Sindh';
    if (masterMd.includes('Federal') || masterMd.includes('S8a5')) dialect = 'Pakistani-Federal';
    if (masterMd.includes('AO1') || masterMd.includes('IGCSE')) dialect = 'Cambridge-IGCSE';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- SYNTHESIS_VERSION: 12.0 -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Neural Structurer Fault]:", err);
    // Fallback to Flash for rapid recovery
    try {
      const fallbackRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      return fallbackRes.text || rawText;
    } catch (e) {
      return rawText;
    }
  }
}