import { GoogleGenAI } from "@google/genai";

/**
 * MASTER CURRICULUM ARCHITECT (v155.0 - ULTRA-FAST FLASH)
 * Mission: Rapidly transform raw text into standardized Master MD.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Switched to Flash for high-speed structural mapping
  const modelName = 'gemini-3-flash-preview'; 

  const systemInstruction = `# ULTRA-FAST CURRICULUM INGESTION PROTOCOL

You are a world-class pedagogy architect. Your task is to transform raw curriculum text into a standardized Master MD format with absolute speed.

### 🧬 ATOMIC SLO TAGGING
- Format every outcome as: - [TAG:CODE] | BLOOM_LEVEL : Description
- Ensure every code is unique and alphanumeric.

### 🏗️ MASTER MD STRUCTURE
# GRADE [XX]
### DOMAIN [X]: [TITLE]
- [TAG:CODE] | [BLOOM] : [Text]

### 📊 DATA INDEX
At the VERY END, provide a JSON block wrapped in <STRUCTURED_INDEX> tags.
<STRUCTURED_INDEX>
[
  { "code": "P09A01", "text": "...", "subject": "Physics", "grade": "09", "domain": "A", "bloomLevel": "Analyze" }
]
</STRUCTURED_INDEX>`;

  const prompt = `[LINEAR_EXTRACT] Raw Input:\n${rawText.substring(0, 800000)}`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 0 } // Disabled for instant response
      }
    });

    return response.text || "<!-- INGESTION_FAILURE -->";
  } catch (err) {
    console.error("❌ [Architect Node Error]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}