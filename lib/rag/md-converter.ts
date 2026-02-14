
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM INGESTION NODE (v4.0 - NEURAL BRAIN)
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
   - Use strict markdown hierarchy:
     # GRADE [NUM] (e.g., # GRADE IX)
     ## DOMAIN [IDENTIFIER]: [NAME] (e.g., ## DOMAIN C: MECHANICS)
     **Standard:** [Standard statement]
     **Benchmark [NUM]:** [Benchmark description]
   - Use '---' to separate grade levels.

2. 🧬 SURGICAL SLO EXTRACTION:
   - Parse every Student Learning Outcome (SLO) as a discrete unit.
   - Generate/Verify Unique ID: [Subject Code]-[Grade]-[Domain]-[Number] (e.g., P-09-C-01).
   - Format: "- SLO: [ID]: [Action Verb] [Content] [Context in brackets]."
   - Deep Bloom's Analysis: Identify action verbs and map to cognitive levels (Remember, Understand, Apply, Analyze, Evaluate, Create).

3. 🧪 STEM FIDELITY:
   - Wrap ALL formulas and equations in LaTeX $...$ or $$...$$.
   - Maintain all bracketed qualifiers [including...] and parenthetical context exactly.

4. 🧹 ADMINISTRATIVE SCRUBBING:
   - Remove prefaces, page numbers, and institutional boilerplate unless it contains core metadata.
   - Separate "mingled" text where headers are fused with body content.

RESULT: A RAG-optimized pedagogical masterpiece.`;

  const prompt = `
[MISSION: UNIVERSAL CURRICULUM TRANSFORMATION]
Analyze the following curriculum stream and output a MASTER MD file following the Unrolled Column Protocol.

RAW TEXT:
${rawText.substring(0, 450000)}

[OUTPUT SPECIFICATION]:
- Start with # MASTER MD: [CURRICULUM NAME] ([YEAR])
- Include a PREAMBLE section with processing metadata.
- Group all content by GRADE, then DOMAIN, then STANDARD/BENCHMARK.
- Ensure every SLO has a unique code.
- Wrap all math in $...$.`;

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
    
    // Dialect Detection for registry
    let dialect = 'Standard';
    if (masterMd.toLowerCase().includes('sindh')) dialect = 'Pakistani-Sindh-2024';
    else if (masterMd.toLowerCase().includes('cambridge')) dialect = 'Cambridge-IGCSE';
    else if (masterMd.toLowerCase().includes('ksa')) dialect = 'KSA-Vision-2030';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v40.0-PRO -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [Ingestion Engine] Fault:", err);
    return rawText;
  }
}
