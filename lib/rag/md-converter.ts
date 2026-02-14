import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL NEURAL STRUCTURER (v40.0 - MASTER ARCHITECT)
 * Logic: Linearizes curriculum into high-fidelity "Master MD" with deep pedagogical metadata.
 * Protocol: Unrolled Column Protocol
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are the Universal Document Ingestion Node for EduNexus AI Neural Brain V4.0.
Your mission is to convert raw curriculum PDFs/OCR into a structured "Master MD" format using the UNROLLED COLUMN PROTOCOL.

CORE TRANSFORMATION PRINCIPLES:

1. 🏛️ UNROLLED COLUMN PROTOCOL:
   - Each grade level MUST be a self-contained, linear unit.
   - Hierarchy: 
     # GRADE [NUM/ROMAN]
     ## DOMAIN [CODE]: [NAME]
     **Standard:** [Statement]
     **Benchmark [NUM]:** [Description]
   - Use '---' to separate grade sections.
   - Ensure zero cross-grade contamination in the primary structure.

2. 🧬 SURGICAL SLO EXTRACTION:
   - Identify every learning outcome as an atomic unit.
   - Generate unique codes: [Subject Code]-[Grade]-[Domain]-[Number] (e.g., P-09-C-03).
   - Format: "- SLO: [ID]: [Action Verb] [Content] [Context in brackets]."
   - Deep Bloom's Analysis: Map every SLO to its cognitive level (Remember, Understand, Apply, Analyze, Evaluate, Create).

3. 🧪 STEM FIDELITY & CLEANUP:
   - Preserve ALL formulas in LaTeX $...$ or $$...$$.
   - Maintain all bracketed qualifiers and examples exactly as written.
   - Remove administrative noise, headers, footers, and page numbers.
   - Join mid-sentence page breaks before ID assignment.

RESULT: A database-ready, RAG-optimized pedagogical masterpiece.`;

  const prompt = `
[MISSION: UNIVERSAL CURRICULUM INGESTION]
Analyze the raw curriculum stream below. 
1. Map the Grade, Domain, and Standard context for every section.
2. Linearize progression grids into the Unrolled Column format.
3. Transform every bullet point into a detailed SLO block with rich Bloom's Analysis.

RAW CURRICULUM STREAM:
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
    
    // Auto-detect Dialect for registry
    let dialect = 'Standard';
    const lowerMd = masterMd.toLowerCase();
    if (lowerMd.includes('sindh')) dialect = 'Pakistani-Sindh-2024';
    else if (lowerMd.includes('cambridge')) dialect = 'Cambridge-International';
    else if (lowerMd.includes('ksa')) dialect = 'KSA-Vision-2030';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v40.0 -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Fault:", err);
    return rawText;
  }
}
