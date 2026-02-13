
import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL NEURAL STRUCTURER (v29.0 - CANONICAL FLOW)
 * Logic: Linearizes curriculum into standard Markdown.
 * Feature: DE-DUPLICATION ENGINE to remove repetitive curriculum noise.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const systemInstruction = `You are a world-class Curriculum Architect.
Your goal is to convert raw, messy curriculum PDFs into a "Master MD" format that is beautiful, logical, and readable.

CRITICAL RULES FOR "WORLD-CLASS" OUTPUT:

1. 🚫 NO REPETITION (Deduplication Mode):
   - Curriculum documents often list the same SLOs in the "Table of Contents", then in the "Unit Overview", and again in the "Chapter Details".
   - IGNORE the Table of Contents and Brief Overviews.
   - OUTPUT ONLY THE DETAILED DEFINITION of the SLOs.
   - If an SLO code (e.g., [SLO: B-09-A-01]) appears twice, output it ONLY ONCE in its most relevant section.

2. 🏛️ STRICT HIERARCHY:
   - # GRADE [ROMAN/NUM] (e.g., # GRADE IX)
   - ## DOMAIN [NAME] (e.g., ## DOMAIN A: BIODIVERSITY)
   - ### STANDARD [TEXT]
   - #### BENCHMARK [TEXT]

3. 💊 SLO CARD FORMAT (The "Blue Pill" Target):
   - You MUST place every SLO on its own line.
   - Format: "[SLO: CLEAN-CODE] Description"
   - CLEAN THE CODE: Remove internal spaces (B - 09 -> B-09). Fix typos (SL0 -> SLO).
   - Ensure a blank line before and after every SLO tag.

4. 🧹 CLEANUP:
   - Remove page numbers, headers, footers, and "This page intentionally left blank".
   - If the text is "mingled" (sentences run together), fix the grammar and punctuation.

RESULT: A clean, flowing document that reads like a high-quality syllabus, not a raw data dump.`;

  const prompt = `
[MISSION: CANONICAL CURRICULUM SYNTHESIS]
Process the raw text below. 
1. Detect the Grade Level and Subject.
2. Group all SLOs logically.
3. REMOVE ALL REPETITIVE TEXT. I only want the definitive list of standards, not the summaries.

RAW TEXT STREAM:
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
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v29.0 -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Fault:", err);
    return rawText;
  }
}
