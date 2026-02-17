import { GoogleGenAI } from "@google/genai";

/**
 * MASTER CURRICULUM ARCHITECT (v156.0 - UNIVERSAL)
 * Mission: High-fidelity transformation of raw PDF text into Structured Master MD.
 * Optimized for: Grade IX-XII Progression Grids.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-flash-preview'; 

  const systemInstruction = `# UNIVERSAL CURRICULUM LINEARIZATION PROTOCOL

You are a world-class pedagogy architect specializing in Pakistani (Sindh/Federal) and International progression grids.

### 🏗️ MANDATORY HIERARCHY
1. **Subject**: Extract the primary subject (e.g. Physics, Biology).
2. **Grade**: Standardize to # GRADE [XX] (e.g. # GRADE 09).
3. **Domain**: Standardize to ### DOMAIN [X]: [Title] (e.g. ### DOMAIN A: Nature of Science).

### 🧬 ATOMIC SLO TAGGING
You MUST tag every learning outcome using this exact format:
- [SLO:S-GG-D-NN] | [BLOOM_LEVEL] : [Full Text]

WHERE:
- S = Single Letter Subject (P for Physics, B for Bio, etc.)
- GG = 2-digit Grade (09, 10, 11, 12)
- D = Domain Letter (A, B, C, etc.)
- NN = 2-digit Sequence Number.

### 📊 DATA INDEX
At the VERY END, provide a JSON block wrapped in <STRUCTURED_INDEX> tags for the database vault.
<STRUCTURED_INDEX>
[
  { "code": "P-09-A-01", "text": "...", "subject": "Physics", "grade": "09", "domain": "A", "bloomLevel": "Understand" }
]
</STRUCTURED_INDEX>`;

  const prompt = `[SYNTHESIS_REQUEST] Standardize the following raw curriculum text into a Master MD progression grid:\n\n${rawText.substring(0, 100000)}`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    return response.text || "<!-- INGESTION_FAILURE -->";
  } catch (err) {
    console.error("❌ [Architect Node Error]:", err);
    return `<!-- ERROR: NEURAL GATEWAY TIMEOUT -->\n${rawText}`;
  }
}