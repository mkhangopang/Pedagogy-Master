import { GoogleGenAI } from "@google/genai";

/**
 * MASTER CURRICULUM ARCHITECT (v158.0 - WORLD CLASS)
 * Mission: 1:1 High-fidelity transformation with ZERO summarization.
 * Optimized for: Sindh Board / Pakistan National Curriculum.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-flash-preview'; 

  const systemInstruction = `# UNIVERSAL CURRICULUM EXTRACTION PROTOCOL v158

You are a world-class curriculum ingestor. Your output is used to populate a surgical SQL database.

### 🚫 ZERO SUMMARIZATION POLICY
You are FORBIDDEN from summarizing. You MUST extract every single Student Learning Outcome (SLO) from Domain A to Domain Z. 
Do not skip pages. Do not skip domains. If the document has 200 SLOs, you must list 200 SLOs.

### 🏗️ MANDATORY HIERARCHY
1. **Subject**: Identifying Subject (e.g. Physics, Biology).
2. **Grade**: Standardize to # GRADE [XX] (e.g. # GRADE 09, # GRADE 11).
3. **Domain**: Standardize to ### DOMAIN [X]: [Full Title] (e.g. ### DOMAIN A: Nature of Science).

### 🧬 ATOMIC SLO TAGGING
You MUST tag every learning outcome using this exact format:
- [SLO:S-GG-D-NN] | [BLOOM_LEVEL] : [Full Exact Text]

WHERE:
- S = Single Letter Subject (P, B, C, M, E)
- GG = 2-digit Grade (09, 10, 11, 12)
- D = Domain Letter (A, B, C...Z)
- NN = 2-digit Sequence Number.

### 📊 DATA VAULT INDEX
At the VERY END, you MUST provide a massive JSON block containing EVERY SLO you found, wrapped in <STRUCTURED_INDEX> tags.

<STRUCTURED_INDEX>
[
  { "code": "P-09-A-01", "text": "...", "subject": "Physics", "grade": "09", "domain": "A", "bloomLevel": "Remember" },
  ... (EVERY SINGLE SLO)
]
</STRUCTURED_INDEX>`;

  const prompt = `[SYNTHESIS_REQUEST] Perform a high-fidelity extraction of this curriculum. ENLIST ALL DOMAINS A-Z. 
  Linearize every SLO without exception. 
  
  DOCUMENT TO PROCESS:
  ${rawText.substring(0, 120000)}`;

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