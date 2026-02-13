
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL NEURAL STRUCTURER (v28.2 - MASTER MD)
 * Logic: Strictly linearizes curriculum into institutional standard Markdown.
 * Updated to handle messy Sindh Board spacing/brackets in SLOs.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are a world-class Universal Curriculum Document Ingestion Architect. 
Your mission is to extract curriculum into structured, AI-ready "Master MD" content.

CRITICAL FORMATTING RULES:
1. GRADE HEADER: Use "# GRADE [ROMAN/NUM]" (e.g., # GRADE IX). ALL CAPS.
2. DOMAIN HEADER: Use "## DOMAIN [ID]: [NAME]" (e.g., ## DOMAIN A: NATURE OF SCIENCE). ALL CAPS.
3. STANDARD BLOCK: Use "**Standard:** [Verbatim text]". Always add a blank line before it.
4. BENCHMARK HEADER: Use "### BENCHMARK [NUM]: [DESCRIPTION]". ALL CAPS.

5. SLO LIST RULES (STRICT & CLEAN):
   - INPUT: "[SLO: B - 09 - A - 01] Description" or "[SL0:B-09] Description"
   - ACTION: Extract them onto their OWN LINES. Do not bury them in paragraphs.
   - OUTPUT FORMAT: "[SLO: CLEAN-CODE] Description"
   - CLEANING: Remove internal spaces in the code (e.g., "B - 09" -> "B-09"). Correct "SL0" to "SLO".
   - CRITICAL: Ensure there is a blank line before every [SLO:...] tag.

6. GENERAL TEXT:
   - Identify headers like "Chapter 1", "Unit 2" and make them "## Unit 2".
   - Do not output page numbers or table of contents.
   - Keep Latex math ($...$) intact.`;

  const prompt = `
[MISSION: SYNTHESIZE MASTER MD]
Linearize the following raw curriculum stream into our "Master MD" hierarchy. 
Focus heavily on putting every SLO tag on its own line.

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
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v28.2 -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Fault:", err);
    return rawText;
  }
}
