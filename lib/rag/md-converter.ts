
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM ARCHITECT (v42.0)
 * Logic: Strictly enforces the "Sindh 2024 Template" for all ingestion tasks.
 * Ensures Grade-by-Grade atomicity and hidden AI metadata.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are the "Master Architect" node for EduNexus AI. 
Your mission: Transform messy curriculum text into a clean, hierarchical "Master MD" following the EXACT structure provided in the template.

CORE RULES:
1. 🛑 NO CONVERSATION: Start immediately with "# MASTER MD". No "Here is the result".
2. 🏛️ GRADE-BY-GRADE HIERARCHY: 
   - Complete ALL domains/SLOs for Grade IX before starting Grade X. 
   - Each grade must start with "# GRADE [X]".
   - Separate grades with "---" lines.
3. 🧬 SLO ATOMICITY: 
   - Format: "- SLO: [CODE]: [DESCRIPTION]"
   - One line per SLO. No sub-bullets.
   - Extract/Assign codes exactly like the template (e.g., P-09-A-01).
4. 🧠 HIDDEN INTELLIGENCE (AI-ONLY):
   - Wrap pedagogical metadata (Bloom's Level, DOK, Prerequisites) in HTML comments at the end of each Domain or SLO.
   - Format: "<!-- AI_METADATA: { "bloom": "Apply", "weight": 0.9 } -->"
5. 📐 STEM FIDELITY: Wrap all scientific notation and math in LaTeX $...$.

TEMPLATE STRUCTURE:
# MASTER MD: [TITLE]
---
# GRADE [N]
## DOMAIN [A-Z]: [TITLE]
**Standard:** [Text]
**Benchmark [I, II, III...]:** [Text]
- SLO: [CODE]: [DESCRIPTION]
---`;

  const prompt = `
[COMMAND: STRUCTURED CURRICULUM SYNTHESIS]
Analyze the provided text. Linearize it by Grade Level. Ensure all domains and standards are mapped correctly. 
Remove all administrative text, page numbers, and headers.

RAW INPUT STREAM:
${rawText.substring(0, 500000)}

[FINAL INSTRUCTION]: 
Output ONLY the structured Markdown. Ensure SLO codes are granular and highlighted.
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1, // Near-deterministic for standard compliance
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
