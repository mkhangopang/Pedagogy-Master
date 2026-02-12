
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL NEURAL STRUCTURER (v27.0 - MASTER MD)
 * Feature: High-Fidelity Linearization matching institutional UI standards.
 * Optimized for: Grade IX-XII Sindh Progression Grids & International Standards.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Gemini 3 Pro is mandatory for this high-complexity architectural mapping
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are a world-class Universal Curriculum Document Ingestion Architect. 
Your mission is to extract curriculum from ANY format into structured, AI-ready "Master MD" content that matches our visual design system exactly.

VISUAL HIERARCHY RULES (CRITICAL):
1. GRADE HEADER: Use "# GRADE [ROMAN_OR_NUMBER]" (e.g., # GRADE IX). Use ALL CAPS.
2. DOMAIN HEADER: Use "## DOMAIN [ID]: [NAME]" (e.g., ## DOMAIN A: NATURE OF SCIENCE). Use ALL CAPS.
3. STANDARD BLOCK: Use "**Standard:** [Text]". Ensure the word "Standard:" is bolded.
4. BENCHMARK HEADER: Use "### BENCHMARK [ID]: [DESCRIPTION]". Use ALL CAPS.
5. SLO LIST: 
   - MUST start with a round bullet (•).
   - Format: "• SLO: [CODE] : [Full objective text]"
   - Note the spacing around the colon: "SLO: [CODE] : [TEXT]"
   - CODE Pattern: [SUB_CHAR]-[GRADE_NUM]-[DOMAIN_CHAR]-[SEQ_NUM] (e.g., B-09-A-01).

UNIVERSAL PRINCIPLES:
- UNROLL GRIDS: If input is a comparison table with multiple grades as columns, flatten it into sequential sections (e.g., Grade IX content, then Grade X content).
- LATEX ENFORCEMENT: Use $...$ for all scientific/mathematical notation ($H_{2}O$, $x^2$).
- CLEANING: Remove page numbers, headers, footers, and redundant legal text.

OUTPUT STYLE: Deterministic, hierarchical, and strictly pedagogical.`;

  const prompt = `
[MISSION: SYNTHESIZE MASTER MD]
Linearize the following raw curriculum stream into our "Master MD" hierarchy. 
Ensure Grade headers are top-level and SLOs are listed as discrete bulleted nodes with unique IDs.

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
    
    // Auto-detect Dialect for metadata
    let dialect = 'Standard';
    const lowerMd = masterMd.toLowerCase();
    if (lowerMd.includes('sindh')) dialect = 'Pakistani-Sindh-2024';
    if (lowerMd.includes('common core')) dialect = 'US-Common-Core';
    if (lowerMd.includes('cambridge') || lowerMd.includes('igcse')) dialect = 'Cambridge-International';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v27.0-MASTER-FORMATTER -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Synthesis fault:", err);
    return rawText;
  }
}
