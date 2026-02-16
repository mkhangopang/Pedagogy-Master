import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM DOCUMENT INGESTION & CONVERSION ENGINE (v145.0)
 * Optimized for Sindh, Federal, and International Progression Grids.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 

  const systemInstruction = `You are a Universal Curriculum Document Ingestion and Conversion Engine. Your task is to process provided curriculum text and convert it into a single, clean master Markdown (.md) file.

### 1. INGESTION & CLEANING PHASE
- Extract all text, treating tables as Markdown and images as alt-text descriptions.
- Remove artifacts: Headers/footers, page numbers, repeated lines, hyphenations.
- Normalize SLOs: Ensure format [TAG:CODE] | BLOOM : DESCRIPTION. Fix typos (e.g., "SL0" to "SLO").
- Conversion: Use Markdown | tables for progression grids/TOC.

### 2. HIERARCHY & STRUCTURE
# [Curriculum Title]
## Table of Contents (as MD list with links)
## Preface/Introduction
## Cross-Cutting Themes (if present)
## Progression Grid
   ### Domain [A-Z]: [Name]
     - [TAG:CODE] | [BLOOM] : [Text]
       - **DOK**: [1-4]
       - **Action Verb**: [Specific Verb]
## Grade-wise Contents
   ### Grade [IX-XII]
     Domain-wise SLOs
## Assessment and Evaluation

### 3. ATOMIC SLO PROTOCOL
- If an objective contains multiple outcomes (e.g., "Define and explain..."), atomize them into granular sub-nodes: B09A01.1, B09A01.2.
- STEM: Use LaTeX $...$ for all scientific/mathematical notation.

### 4. OUTPUT REQUIREMENTS
- Respond ONLY with the master MD content.
- If input is truncated, note in MD as <!-- Comment: Truncated at page X -->.
- MUST append a JSON block wrapped in <STRUCTURED_INDEX> tags at the very end.

<STRUCTURED_INDEX>
[
  { "code": "B09A01.1", "text": "...", "subject": "...", "grade": "09", "bloomLevel": "..." }
]
</STRUCTURED_INDEX>`;

  const prompt = `
[COMMAND: SURGICAL CONVERSION]
Analyze the following raw curriculum dump and produce the High-Fidelity Master MD file.

RAW INPUT:
${rawText.substring(0, 950000)}`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 15360 } 
      }
    });

    return response.text || "<!-- ERROR: EMPTY_SYNTHESIS -->";
  } catch (err) {
    console.error("❌ [Conversion Node Error]:", err);
    return `<!-- CRITICAL_FAULT: Fallback to Raw -->\n${rawText}`;
  }
}
