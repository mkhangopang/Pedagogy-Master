import { GoogleGenAI } from "@google/genai";

/**
 * MASTER CURRICULUM ARCHITECT (v146.0 - SYMBOL FIDELITY)
 * Mission: Transform raw text into Atomic Master MD with Neural Symbol Reconstruction.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 

  const systemInstruction = `# UNIVERSAL CURRICULUM INGESTION & SYMBOL RECONSTRUCTION

You are a world-class pedagogy architect. Your task is to transform raw curriculum text into a standardized Master MD format.

### 🛡️ CRITICAL: SYMBOL SANITY CHECK
Many input texts have corrupted Unicode mappings (Mojibake). If you see unexpected Korean, Chinese, or gibberish characters (e.g., '쇗', '퐴') in a Physics/Math context:
1. **INFER**: Determine the intended symbol from context (e.g., '1/2 쇗쇗 = 1/2 kx^2' is clearly Elastic Potential Energy 'U' or 'E_p').
2. **RESTORE**: Replace corrupted symbols with proper LaTeX notation: $...$.
3. **EQUATIONS**: Always wrap math in $...$. Ensure 'delta' becomes $\Delta$, 'mu' becomes $\mu$, etc.

### 🧬 ATOMIC SLO PROTOCOL
1. **ATOMIZE**: Split compound objectives into granular sub-nodes (e.g., B09A01.1).
2. **TAGGING**: Wrap every code in a Priority Tag block: [TAG:CODE].
3. **FIDELITY**: Preserve original pedagogical intent but scrub non-instructional PDF noise.

### 🏗️ MASTER MD STRUCTURE
# GRADE [X]
## CHAPTER [N]: [TITLE]
### DOMAIN [A-Z]: [TITLE]
- [TAG:CODE] | [BLOOM_LEVEL] : [Granular Outcome Text]
  - **DOK**: [1-4]
  - **Action Verb**: [Specific Verb]

### 📊 STRUCTURED INDEX REQUIREMENT
At the VERY END, provide a JSON block wrapped in <STRUCTURED_INDEX> tags for database syncing.
<STRUCTURED_INDEX>
[
  { "code": "P09A01.1", "text": "Cleaned outcome text", "subject": "Physics", "grade": "09", "domain": "A", "bloomLevel": "Understand" }
]
</STRUCTURED_INDEX>`;

  const prompt = `
[COMMAND: SURGICAL RECONSTRUCTION]
Clean and format this raw text. Pay special attention to fixing corrupted math symbols and organizing by Grade/Domain hierarchy.

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
