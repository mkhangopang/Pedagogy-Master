import { GoogleGenAI } from "@google/genai";

/**
 * MASTER CURRICULUM ARCHITECT (v160.0 - UNIVERSAL ENGINE)
 * Mission: 1:1 High-fidelity transformation with ZERO summarization.
 * Optimized for: Sindh Board / Federal / International Linearization.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-flash-preview'; 

  const systemInstruction = `# UNIVERSAL CURRICULUM EXTRACTION PROTOCOL v160

You are a world-class curriculum ingestor. Your mission is to linearize curriculum PDFs into clean Markdown ledger files.

### 🚫 ZERO SUMMARIZATION POLICY
You are FORBIDDEN from summarizing. You MUST extract every single Student Learning Outcome (SLO) from every domain.
Do not skip content. If a document has 300 SLOs, you must list 300 SLOs.

### 🏗️ HIERARCHY & SEQUENCE
1. **Metadata**: Header '# Curriculum Metadata' followed by Board, Subject, Grade, Version.
2. **Grade Sections**: Use '# GRADE [XX]' (e.g. # GRADE 09).
3. **Domains**: Use '### DOMAIN [X]: [Title]' (e.g. ### DOMAIN A: Life Sciences).
4. **Ordering**: Sequence domains alphabetically (A, B, C...).

### 🧬 ATOMIC SLO TAGGING
You MUST tag every learning outcome using this exact format:
- [SLO:S-GG-D-NN] | [BLOOM_LEVEL] : [Full Exact Text]

WHERE:
- S = Single Letter Subject (P, B, C, M, E, S)
- GG = 2-digit Grade (04, 05, 09, 10, 11, 12)
- D = Domain Letter (A, B, C...Z)
- NN = Sequence Number (01, 02...).

### 📊 DATA VAULT INDEX
At the VERY END, provide a JSON block of ALL found SLOs wrapped in <STRUCTURED_INDEX> tags.

<STRUCTURED_INDEX>
[
  { "code": "P-09-A-01", "text": "...", "subject": "Physics", "grade": "09", "domain": "A", "bloomLevel": "Understand" },
  ...
]
</STRUCTURED_INDEX>`;

  const prompt = `[SYNTHESIS_REQUEST] Convert the following raw curriculum text into a Master Markdown Ledger. 
  Linearize EVERY domain and EVERY SLO without exception. Ensure the Subject-Grade-Domain code sequence is perfect.
  
  DOCUMENT BUFFER:
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