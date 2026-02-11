import { GoogleGenAI } from "@google/genai";

/**
 * WORLD-CLASS NEURAL STRUCTURER (v15.0)
 * Specialized for Full-Spectrum ECE to XII Institutional Curricula.
 * FEATURE: Developmental Phase Detection & Spiral Progression Mapping.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Pro model required for complex developmental unrolling across 13 grade levels
  const modelName = 'gemini-3-pro-preview';
  
  const prompt = `
TASK: Convert the provided raw curriculum OCR into a high-fidelity "Master MD" pedagogical database.

DEVELOPMENTAL SCOPE: This document covers ECE (Early Childhood) through Grade XII.

STRICT RECONSTRUCTION RULES:
1. DEVELOPMENTAL PHASE UNROLLING: 
   - ECE/KATCHI: Focus on developmental milestones and play-based outcomes.
   - PRIMARY (I-V): Focus on foundational skills and literacy.
   - MIDDLE (VI-VIII): Focus on conceptual grounding.
   - SECONDARY (IX-XII): Focus on academic rigor and career readiness.
   - For any table comparing these, create vertically isolated markdown blocks for each grade.

2. SPIRAL PROGRESSION ANCHORING: 
   - Every SLO code must be preserved verbatim (e.g., S8a5, B-09-A-01).
   - If a code is repeated across grades (Spiral Recycling), append the Grade level to the anchor.
   - Format: # GRADE [X] > ## DOMAIN [Y] > ### STANDARD [Z] > #### BENCHMARK [W] > - SLO: [CODE]: [TEXT].

3. GRID TRANSPOSITION: 
   - If a row spans Grade I, II, and III, split it into three distinct markdown nodes.
   - Ensure the "Benchmark" description is repeated as a header for each grade's outcome.

4. DIALECT RECOVERY:
   - Normalize Roman numerals (I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII).
   - Fix OCR errors: "SL0" -> "SLO", "Katchi" -> "ECE/Katchi".

RAW TEXT STREAM:
${rawText.substring(0, 250000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction: "You are a senior curriculum engineer specializing in the K-12 continuum. You reconstruct complex institutional documents into structured, RAG-ready markdown with 100% data fidelity.",
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const masterMd = response.text || rawText;
    
    // Enhanced Dialect Detection
    let dialect = 'Standard';
    if (masterMd.includes('Sindh')) dialect = 'Pakistani-Sindh-ECE-XII';
    if (masterMd.includes('Federal')) dialect = 'Pakistani-Federal-K-XII';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- DEVELOPMENTAL_SPAN: ECE-XII -->\n<!-- SYNTHESIS_PROTOCOL: v15.0-CONTINUUM -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Continuum reconstruction fault:", err);
    return rawText;
  }
}