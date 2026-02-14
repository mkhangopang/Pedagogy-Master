
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM INGESTION NODE (v4.0 - MASTER MD)
 * Protocol: Unrolled Column Protocol
 * Logic: Linearizes complex curriculum hierarchies into atomic, RAG-optimized segments.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are the Universal Document Ingestion Node for EduNexus AI Neural Brain V4.0.
Your goal is to convert raw curriculum text/OCR into a structured "Master MD" format using the UNROLLED COLUMN PROTOCOL.

CORE TRANSFORMATION RULES:

1. 🏛️ UNROLLED COLUMN PROTOCOL:
   - Each grade must be a self-contained unit.
   - Separate grades with '---'.
   - Use strict markdown hierarchy:
     # GRADE [NUM] (e.g., # GRADE IX)
     ## DOMAIN [ID]: [NAME] (e.g., ## DOMAIN C: MECHANICS)
     **Standard:** [Full standard statement]
     **Benchmark [NUM]:** [Full benchmark description]

2. 🧬 SURGICAL SLO EXTRACTION:
   - Identify every Student Learning Outcome (SLO) as an atomic unit.
   - Generate/Verify Unique ID: [Subject Code]-[Grade]-[Domain]-[Number] (e.g., P-09-C-01).
   - Use exact wording. Maintain all formulas in LaTeX $...$ or $$...$$.
   - Maintain all bracketed qualifiers [including...] and parenthetical context.

3. 🧠 DEEP BLOOM'S ANALYSIS:
   - For every SLO, identify the cognitive level: Remember, Understand, Apply, Analyze, Evaluate, Create.
   - Logic: 
     - Remember: Define, State, List, Identify.
     - Understand: Explain, Differentiate, Illustrate, Justify.
     - Apply: Calculate, Solve, Use, Apply, Determine.
     - Analyze: Analyze, Critique, Assess, Investigate.

4. 🧹 ADMINISTRATIVE SCRUBBING:
   - Remove headers, footers, prefaces, and page numbers.
   - Handle mid-sentence page breaks by joining text before ID assignment.

OUTPUT FORMAT:
# MASTER MD: [CURRICULUM NAME] ([YEAR])
## PREAMBLE
[Protocol declaration and metadata]
---
# GRADE [N]
## DOMAIN [LETTER]: [NAME]
**Standard:** ...
**Benchmark [N]:** ...
- SLO: [ID]: [Action Verb] [Content] [Context].
...`;

  const prompt = `
[MISSION: UNIVERSAL CURRICULUM TRANSFORMATION]
Analyze the curriculum text and produce a high-fidelity MASTER MD following the Unrolled Column Protocol. 
Ensure every SLO has a unique ID and is independently retrievable.

RAW DATA:
${rawText.substring(0, 450000)}`;

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

    const masterMd = response.text || rawText;
    
    // Dialect registry tag
    let dialect = 'Standard';
    if (masterMd.toLowerCase().includes('sindh')) dialect = 'Pakistani-Sindh-2024';
    else if (masterMd.toLowerCase().includes('cambridge')) dialect = 'Cambridge-IGCSE';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v40.0-PRO -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Ingestion Engine] Fault:", err);
    return rawText;
  }
}
