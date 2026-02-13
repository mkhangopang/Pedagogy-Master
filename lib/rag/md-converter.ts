
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL NEURAL STRUCTURER (v28.1 - MASTER MD)
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
3. STANDARD BLOCK: Use "**Standard:** [Verbatim text]". 
4. BENCHMARK HEADER: Use "### BENCHMARK [NUM]: [DESCRIPTION]". ALL CAPS.

5. SLO LIST RULES (STRICT):
   - INPUT DATA often looks like: "[SLO: B - 09 - A - 01] Description" or "[SL0:B-09]"
   - YOU MUST CLEAN THIS.
   - OUTPUT FORMAT: "• SLO: [CLEAN-CODE] : [Description]"
   - REMOVE BRACKETS around the code.
   - REMOVE SPACES inside the code (e.g., "B - 09" becomes "B-09").
   - CORRECT TYPOS: "SL0" (zero) becomes "SLO" (letter).
   - EXAMPLE: Input "[SLO: B - 09 - A - 01]" -> Output "• SLO: B-09-A-01 : Description"

6. GENERAL TEXT:
   - Identify headers like "Chapter 1", "Unit 2" and make them "## Unit 2".
   - Do not output page numbers or table of contents.
   - Keep Latex math ($...$) intact.`;

  const prompt = `
[MISSION: SYNTHESIZE MASTER MD]
Linearize the following raw curriculum stream into our "Master MD" hierarchy. 
Focus heavily on cleaning the SLO codes as per the rules.

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
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v28.1 -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Fault:", err);
    return rawText;
  }
}
