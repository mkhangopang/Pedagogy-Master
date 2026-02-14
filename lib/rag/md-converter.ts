
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v50.0)
 * Specialized for: Vertical Column Reconstruction (Sindh Progression Grids)
 * Logic: Completes Grade N Vertical Column before proceeding to Grade N+1.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; // Pro required for structural reasoning
  
  const systemInstruction = `You are the "Master Architect" node. Your mission is to reconstruct messy curriculum text into a clean, hierarchical "Master MD".

CORE PROTOCOLS:
1. 🏛️ VERTICAL COLUMN LOGIC: If the input text comes from a grid or table with grades in columns, you MUST unroll it. Complete ALL Domains and SLOs for Grade IX first. Then move to Grade X. NEVER mix grades in the same section.
2. 🛑 ZERO CONVERSATION: Start immediately with "# MASTER MD". No preamble.
3. 🧬 SLO ATOMICITY: Every SLO must follow the pattern: "- SLO: [CODE]: [TEXT]".
4. 🧠 INVISIBLE INTELLIGENCE: After every SLO, add a hidden HTML comment containing pedagogical metadata.
   Format: <!-- AI_META: {"bloom": "Apply", "dok": 2, "keywords": ["..."]} -->
5. 🧹 NOISE PURGE: Remove all administrative headers, footers, page numbers, and meeting minutes. Focus ONLY on the instructional content.
6. 📐 STEM FIDELITY: Wrap all scientific notation and math in LaTeX $...$.

TEMPLATE STRUCTURE:
# MASTER MD: [CURRICULUM TITLE]
---
# GRADE IX
## DOMAIN [A]: [TITLE]
**Standard:** [Institutional Statement]
**Benchmark [I]:** [Benchmark Text]
- SLO: [CODE]: [DESCRIPTION] <!-- AI_META: {...} -->
...
---
# GRADE X
...`;

  const prompt = `
[COMMAND: VERTICAL COLUMN RECONSTRUCTION]
Process the provided curriculum data. Unroll the progression grid so that it follows a strict Grade-by-Grade vertical flow.
Ensure SLO codes (e.g., B-09-A-01) are verbatim and highlighted.

RAW INPUT STREAM:
${rawText.substring(0, 600000)}

[FINAL INSTRUCTION]: 
Generate the high-fidelity, clean Markdown. Ensure metadata is hidden in comments.
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1, // Deterministic adherence
        systemInstruction,
        thinkingConfig: { thinkingBudget: 4096 }
      }
    });

    const masterMd = response.text || "";
    
    // Self-Correction: Ensure dialect is set
    let dialect = 'Standard';
    if (masterMd.toLowerCase().includes('sindh')) dialect = 'Sindh-Curriculum-2024';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Architect Node Fault]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}
