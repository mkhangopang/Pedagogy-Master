
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v55.0)
 * Specialized for: Vertical Column Reconstruction & De-shuffling.
 * Use Case: Sindh Board Progression Grids (Column-based layouts).
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; // Required for high-stakes structural reasoning
  
  const systemInstruction = `You are the "Master Architect" node for EduNexus AI. 
Your mission: Transform messy, column-based curriculum text into a clean, hierarchical "Master MD".

CRITICAL: VERTICAL DE-SHUFFLING PROTOCOL
Curriculum documents are often formatted in tables where Column 1 = Grade IX, Column 2 = Grade X, etc. 
OCR often reads these horizontally, mixing the grades. YOU MUST RE-ORDER THIS.

1. 🏛️ GRADE-FIRST HIERARCHY: 
   - You MUST extract and complete ALL content for "GRADE IX" (Domains A-Z, Standards, and SLOs) before writing a single word for "GRADE X".
   - Start each grade with "# GRADE [N]".
   - Separate grades with "---" dividers.

2. 🧬 SLO ATOMICITY: 
   - Format: "- SLO: [CODE]: [DESCRIPTION]"
   - Every SLO must be a distinct line. Do not use nested sub-bullets.

3. 🧠 INVISIBLE METADATA (Neural Grounding):
   - Wrap pedagogical metadata (Bloom's Level, DOK, Keywords) in HTML comments at the end of each SLO.
   - Format: "<!-- AI_META: { "bloom": "Apply", "dok": 2 } -->"

4. 🧹 NOISE SCRUBBING: 
   - Strip all page numbers, footers (e.g., "Curriculum of Biology for Sindh"), and meeting signatures.

5. 📐 STEM FIDELITY: 
   - Wrap all math and chemical notation in LaTeX $...$.

TEMPLATE STRUCTURE:
# MASTER MD: [CURRICULUM TITLE]
---
# GRADE IX
## DOMAIN [A]: [TITLE]
**Standard:** [Text]
**Benchmark [I]:** [Text]
- SLO: [CODE]: [DESCRIPTION] <!-- AI_META: {...} -->
...
---
# GRADE X
...`;

  const prompt = `
[COMMAND: SURGICAL VERTICAL RECONSTRUCTION]
Analyze the provided text stream. It contains curriculum grids where grades are in columns but the text is horizontally interleaved. 
TASK: Trace the vertical path for each Grade. Reconstruct the document so it is strictly ordered by Grade (IX -> X -> XI -> XII).

RAW INPUT STREAM:
${rawText.substring(0, 550000)}

[FINAL INSTRUCTION]: 
Generate the high-fidelity, Grade-ordered Markdown. Verbatim SLO codes only.
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1, // Deterministic adherence to structure
        systemInstruction,
        thinkingConfig: { thinkingBudget: 4096 }
      }
    });

    const masterMd = response.text || "";
    
    // Auto-detect Dialect for the system vault
    let dialect = 'Standard';
    if (masterMd.toLowerCase().includes('sindh')) dialect = 'Sindh-Curriculum-2024';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Architect Node Fault]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}
