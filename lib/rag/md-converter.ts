
import { GoogleGenAI } from "@google/genai";

/**
 * WORLD-CLASS NEURAL STRUCTURER (v6.1)
 * Specialized for Multi-Grade Parallel Curriculum Grids.
 * FIX: Locked temperature for deterministic pedagogical unwrapping.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
TASK: Linearize this parallel multi-column curriculum grid into a hierarchical "Master MD" file.

DIAGNOSTIC CONTEXT:
This raw text contains separate columns for Grade IX, X, XI, and XII. 
Your goal is to "unwrap" these columns so that each Grade has its own distinct Markdown section.

UNWRAPPING RULES:
1. DETECT GRADES: Create sections like "# GRADE IX", "# GRADE X", etc.
2. ATOMIC MAPPING: Every standard MUST be formatted as:
   - SLO: [CODE]: [TEXT]
3. NO MIXING: Do not place a Grade XI SLO inside a Grade IX section.
4. QUALITY: Fix broken sentences and rejoin hyphenated words from the OCR.

RAW TEXT DATA:
${rawText.substring(0, 50000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.1, // Fixed for deterministic pedagogical fidelity
        systemInstruction: "You are a master curriculum engineer. Your output is structured MD that preserves the strict hierarchical intent of the original board.",
      }
    });

    const masterMd = response.text || rawText;
    
    // Dialect Identification Node
    let dialect = 'Standard Global';
    if (masterMd.includes('SLO') && (masterMd.includes('B-') || masterMd.includes('S-'))) dialect = 'Pakistani National (Sindh/Federal)';
    if (masterMd.includes('AO1') || masterMd.includes('IGCSE')) dialect = 'Cambridge Assessment';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Structuring fault:", err);
    return rawText; 
  }
}
