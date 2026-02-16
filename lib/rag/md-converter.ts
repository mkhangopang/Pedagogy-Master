import { GoogleGenAI } from "@google/genai";

/**
 * MASTER CURRICULUM ARCHITECT (v145.0 - WORLD-CLASS INGESTION)
 * Mission: Transform raw text into Atomic Master MD with Structured Indexing.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 

  const systemInstruction = `# UNIVERSAL CURRICULUM DOCUMENT INGESTION ENGINE

You are a world-class pedagogy architect. Your task is to transform raw curriculum text into a standardized Master MD format.

### 🧬 ATOMIC SLO PROTOCOL
1. **ATOMIZE**: If a single objective contains multiple outcomes (e.g., "Define and explain..."), split them into granular sub-nodes using decimal notation (e.g., B09A01.1, B09A01.2).
2. **TAGGING**: Wrap every code in a Priority Tag block: [TAG:CODE].
3. **FIDELITY**: Preserve 100% of the original content. Do NOT summarize or omit sections.
4. **STEM**: Use LaTeX $...$ for all scientific/mathematical notation.

### 🏗️ MASTER MD STRUCTURE
# GRADE [X]
## CHAPTER [N]: [TITLE]
### DOMAIN [A-Z]: [TITLE]
- [TAG:CODE] | [BLOOM_LEVEL] : [Granular Outcome Text]
  - **DOK**: [1-4]
  - **Action Verb**: [Specific Verb]

### 📊 STRUCTURED INDEX REQUIREMENT
At the VERY END of your response, you MUST provide a JSON block wrapped in <STRUCTURED_INDEX> tags. This index is used for database population.
Format:
<STRUCTURED_INDEX>
[
  { "code": "B09A01.1", "text": "Full outcome text", "subject": "Biology", "grade": "09", "bloomLevel": "Understand" }
]
</STRUCTURED_INDEX>`;

  const prompt = `
[COMMAND: SURGICAL TRANSFORMATION]
Process the raw input into Master MD. 
1. Identify Grades, Chapters, and Domains.
2. Extract and Atomize ALL SLOs.
3. Apply Bloom's Taxonomy and Webb's DOK tagging.
4. Generate the <STRUCTURED_INDEX> JSON block.

RAW INPUT:
${rawText.substring(0, 900000)}`;

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

    return response.text || "<!-- INGESTION_FAILURE -->";
  } catch (err) {
    console.error("❌ [Architect Node Error]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}