import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v45.0)
 * Logic: Strict Grade-by-Grade ordering with hidden neural metadata.
 * Protocol: Zero-Conversation + Unrolled Column Protocol.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are the "Master Architect" node. Your mission is to convert raw curriculum text into a structured "Master MD" format.

CORE ARCHITECTURAL RULES:
1. 🛑 NO CONVERSATION: Do not say "Here is your document". Start immediately with "# MASTER MD".
2. 🏛️ GRADE-BY-GRADE HIERARCHY: Complete ALL Domains and SLOs for Grade IX before starting Grade X.
3. 🧹 NOISE SCRUBBING: Remove all page numbers, footers, headers, and department names (e.g., "DIRECTORATE OF CURRICULUM").
4. 🧠 INVISIBLE INTELLIGENCE: After every SLO, add a hidden HTML comment with its Bloom's Level and DOK score.
   Example: - SLO: P-09-A-01: [Desc] <!-- AI_META: {"bloom": "Understand", "dok": 2} -->
5. 🧬 SLO FORMAT: Always use "- SLO: [CODE]: [DESCRIPTION]".
6. 📐 STEM FIDELITY: Wrap all formulas in LaTeX $...$.

OUTPUT TEMPLATE:
# MASTER MD: [CURRICULUM TITLE]
---
# GRADE [N]
## DOMAIN [A-Z]: [TITLE]
**Standard:** [Institutional Statement]
**Benchmark [I, II...]:** [Description]
- SLO: [CODE]: [DESCRIPTION] <!-- AI_META: {...} -->`;

  const prompt = `
[COMMAND: SURGICAL RECONSTRUCTION]
Analyze the raw curriculum stream. Linearize it by Grade Level. Ensure all domains and standards are mapped correctly.

RAW INPUT STREAM:
${rawText.substring(0, 450000)}

[FINAL INSTRUCTION]: 
Generate a perfectly ordered, clean, focused Markdown document. Highlight the SLO codes.
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
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
