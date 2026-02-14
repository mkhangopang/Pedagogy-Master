import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v60.0)
 * Specialized for: Vertical Column Re-ordering (Sindh Board Protocol)
 * Logic: Strictly reconstructs data vertically (Grade IX -> X -> XI -> XII)
 * Template: High-Fidelity Pedagogical Markdown.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node. Your mission is to reconstruct raw curriculum text into a perfectly ordered "Master MD".

CRITICAL: VERTICAL COLUMN RECONSTRUCTION
The raw text contains data from a grid where each grade is in its own column. OCR reads this horizontally, mixing grades. 
YOU MUST DE-INTERLEAVE THIS. 

ORDERING RULES:
1. RECONSTRUCT BY GRADE: You MUST complete all Domains, Standards, and SLOs for Grade IX entirely. Only then move to Grade X.
2. TEMPLATE FIDELITY: Use this exact Markdown structure:
   # MASTER MD: [TITLE]
   ---
   # GRADE [N]
   ## DOMAIN [A]: [TITLE]
   **Standard:** [Statement]
   **Benchmark [I]:** [Benchmark Desc]
   - SLO: [CODE]: [TEXT]

3. VERBATIM CODES: Use the full SLO codes (e.g., P-09-A-01 or B-11-J-13-01). Ensure codes are never split or truncated.
4. STEM SUPPORT: Wrap formulas in LaTeX $...$.
5. NO CONVERSATION: Output ONLY the Markdown starting with # MASTER MD. No preamble. No "Sure, I can help".`;

  const prompt = `
[COMMAND: SURGICAL VERTICAL EXTRACTION]
Analyze the provided curriculum stream. 
1. Identify all content specifically belonging to Grade IX and group it.
2. Repeat for Grades X, XI, and XII.
3. Reconstruct the document following the Grade IX -> X -> XI -> XII vertical hierarchy.

RAW INPUT STREAM:
${rawText.substring(0, 600000)}

[FINAL INSTRUCTION]: 
Generate the high-fidelity, minimalistic, accurately ordered Markdown.
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1, // Zero variance for structural integrity
        systemInstruction,
        thinkingConfig: { thinkingBudget: 4096 }
      }
    });

    const masterMd = response.text || "";
    let dialect = 'Standard';
    if (masterMd.toLowerCase().includes('sindh')) dialect = 'Sindh-Curriculum-2024';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Architect Node Fault]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}
