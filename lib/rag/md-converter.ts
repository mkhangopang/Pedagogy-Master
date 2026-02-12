import { GoogleGenAI } from "@google/genai";

/**
 * WORLD-CLASS NEURAL STRUCTURER (v16.0)
 * Specialized for ECE-XII English & Complex Nested Grids.
 * FEATURE: UID Hydration & Spiral Contextualization.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Gemini 3 Pro is required for the high-cognitive task of synthesizing unique IDs from grid context
  const modelName = 'gemini-3-pro-preview';
  
  const prompt = `
TASK: Convert the provided curriculum OCR into a "Master MD" Pedagogical Database.

CRITICAL CHALLENGE:
The source text uses generic numbering (e.g., "1.1.1") that repeats across grades.
You must UNROLL tables and HYDRATE these numbers into Globally Unique IDs.

STRICT RECONSTRUCTION PROTOCOL:

1. HIERARCHY DETECTION:
   - Identify the ROOT: Subject (e.g., English).
   - Identify LEVEL 1: Competency (e.g., C1 Reading).
   - Identify LEVEL 2: Standard.
   - Identify LEVEL 3: Benchmark.

2. GRID LINEARIZATION (The "Unroll" Rule):
   - The document lists Grades side-by-side (e.g., ECE | Class I | Class II).
   - You MUST separate these into distinct, sequential blocks.
   - DO NOT create Markdown tables. Create headers.

3. UID HYDRATION (The "Unique Code" Rule):
   - NEVER output just "1.1.1". Context is lost in vector search.
   - SYNTHESIZE a code using: [SUBJECT]-[GRADE]-C[COMPETENCY]-[BENCHMARK]-[SLO]
   - Example Input: Grade 9, Competency 1, SLO 1.1.1 "Analyze paragraphs..."
   - Example Output: "- SLO: ENG-09-C1-1.1.1: Analyze paragraphs..."

4. DEVELOPMENTAL SPAN:
   - ECE/Katchi -> Grade 00
   - Primary -> Grade 01-05
   - Middle -> Grade 06-08
   - Secondary -> Grade 09-10
   - HSSC -> Grade 11-12

5. OUTPUT STRUCTURE:
   # GRADE 09
   ## COMPETENCY 1: Reading
   ### STANDARD: Students will search for...
   #### BENCHMARK 1.1: Analyze patterns...
   - SLO: ENG-09-C1-1.1.1: Analyze the order of paragraphs...
   - SLO: ENG-09-C1-1.1.2: Analyze organizational patterns...

RAW TEXT STREAM:
${rawText.substring(0, 250000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction: "You are a Curriculum Architect. Transform flat text into a relational knowledge graph. Every SLO must have a unique, searchable ID.",
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const masterMd = response.text || rawText;
    
    // Dialect Tagging
    let dialect = 'Standard';
    if (masterMd.includes('Sindh')) dialect = 'Pakistani-Sindh-2016';
    if (masterMd.includes('ENG-')) dialect = 'Hydrated-SLO-Grid';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n<!-- INGESTION_ENGINE: v16.0-UID-HYDRATION -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Hydration fault:", err);
    return rawText;
  }
}