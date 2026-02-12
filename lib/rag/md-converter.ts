
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL NEURAL STRUCTURER (v28.0 - MASTER MD)
 * Logic: Strictly linearizes curriculum into institutional standard Markdown.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are a world-class Universal Curriculum Document Ingestion Architect. 
Your mission is to extract curriculum into structured, AI-ready "Master MD" content matching our visual design system.

STRICT VISUAL RULES:
1. GRADE HEADER: Use "# GRADE [ROMAN/NUM]" (e.g., # GRADE IX). ALL CAPS.
2. DOMAIN HEADER: Use "## DOMAIN [ID]: [NAME]" (e.g., ## DOMAIN A: NATURE OF SCIENCE). ALL CAPS.
3. STANDARD BLOCK: Use "**Standard:** [Verbatim text]". 
4. BENCHMARK HEADER: Use "### BENCHMARK [NUM]: [DESCRIPTION]". ALL CAPS.
5. SLO LIST: 
   - MUST start with a bullet (•).
   - Format: "• SLO: [CODE] : [Full objective text]"
   - CODE Pattern: [SUB]-[GRADE]-[DOMAIN]-[SEQ] (e.g., B-09-A-01).

UNIVERSAL PRINCIPLES:
- Flat Linearization: Unroll comparison grids into sequential Grade sections.
- LaTeX: Use $...$ for all math/chemistry notation.
- Clean text: Omit page numbers, redundant footers, and table-of-contents noise.`;

  const prompt = `
[MISSION: SYNTHESIZE MASTER MD]
Linearize the following raw curriculum stream into our "Master MD" hierarchy. 
Ensure Grade headers are top-level and SLOs are listed as discrete bulleted nodes.

RAW CURRICULUM STREAM:
${rawText.substring(0, 300000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const masterMd = response.text || rawText;
    
    // Auto-detect Dialect for the indexer
    let dialect = 'Standard';
    const lowerMd = masterMd.toLowerCase();
    if (lowerMd.includes('sindh')) dialect = 'Pakistani-Sindh-2024';
    if (lowerMd.includes('cambridge')) dialect = 'Cambridge-International';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v28.0 -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Fault:", err);
    return rawText;
  }
}
