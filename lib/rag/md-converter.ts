import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL NEURAL STRUCTURER (v41.0 - MASTER ARCHITECT)
 * Logic: Linearizes curriculum into high-fidelity "Master MD" with deep pedagogical metadata.
 * Protocol: Unrolled Column Protocol v2.0
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
     **Benchmark [NUM]: [Description]**
   - Use '---' to separate grade sections.
   - Ensure zero cross-grade contamination. If a table has multiple grades, unroll them into separate sections.

2. 🧬 SURGICAL SLO EXTRACTION:
   - Identify every learning outcome as an atomic unit.
   - Generate/Preserve unique codes: [Subject Code]-[Grade]-[Domain]-[Number] (e.g., B-09-A-01).
   - Format: "- SLO: [ID]: [Action Verb] [Content] [Context in brackets]."
   - Every SLO line MUST start with "- SLO: [ID]:" for the surgical indexer to find it.

3. 🧪 STEM FIDELITY & CLEANUP:
   - Preserve ALL formulas in LaTeX $...$ or $$...$$.
   - Maintain all bracketed qualifiers and examples exactly as written.
   - Remove administrative noise, headers, footers, and page numbers.
   - Join mid-sentence page breaks before ID assignment.

4. 📊 PROGRESSION GRIDS:
   - If unrolling a grid, repeat the Domain and Standard context for every single row to maintain RAG context density.

RESULT: A database-ready, RAG-optimized pedagogical masterpiece.`;

  const prompt = `
[MISSION: UNIVERSAL CURRICULUM INGESTION]
Analyze the raw curriculum stream provided. 
1. Map the Grade, Domain, and Standard context for every section.
2. Linearize progression grids into the Unrolled Column format.
3. Transform every bullet point into a detailed SLO block.

RAW CURRICULUM STREAM:
${rawText.substring(0, 400000)}

[OUTPUT SPECIFICATION]:
- Start with # MASTER MD: [CURRICULUM NAME]
- Group all content by GRADE, then DOMAIN, then STANDARD/BENCHMARK.
- Wrap all math in $...$.
- Ensure no markdown formatting is broken.`;

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
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v41.0 -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Fault:", err);
    return `<!-- ERROR: MD CONVERSION FAILED -->\n${rawText}`;
  }
}
