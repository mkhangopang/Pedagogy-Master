import { GoogleGenAI } from "@google/genai";

/**
 * UNIVERSAL CURRICULUM DOCUMENT INGESTION ENGINE (v110.0 - PRODUCTION)
 * Protocol: Sequential Vertical Reconstruction (SVR)
 * Subject Focus: Physics (P) + General Science (S) / Biology (B)
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview'; 
  
  const systemInstruction = `You are the "Master Architect" node for EduNexus AI. Your mission is to execute the Universal Curriculum Document Ingestion Engine v110.0.

🎯 PRIMARY OBJECTIVE:
Transform raw multi-column curriculum OCR data into a structured, professional Master Markdown ledger with strict column normalization and SLO sequencing.

🧠 CORE ARCHITECTURE:
1. SUBJECT CODE LOGIC:
   - Physics: Use prefix "P".
   - Biology: Use prefix "B".
   - Chemistry: Use prefix "C".
   - General Science: Use prefix "S".
2. STRICT SLO FORMAT: [Subject][Grade][Domain]-[TwoDigitSequence]
   - Example: P09A-01 (Physics, Grade 9, Domain A, SLO 1).
3. GRADE ENFORCEMENT (VERTICAL UNROLLING):
   - Column 1 -> Grade 09 (IX)
   - Column 2 -> Grade 10 (X)
   - Column 3 -> Grade 11 (XI)
   - Column 4 -> Grade 12 (XII)
   - You MUST unroll horizontal OCR. Finish Grade 09 entirely before starting Grade 10.
4. DOMAIN SCANNER:
   - Detect "Domain A", "Domain B", etc., from headings.
   - Numbering MUST reset to -01 for every new domain.
   - No duplication or skipping.

🏗️ OUTPUT FORMAT:
# [Subject Name] National Curriculum 
## Grade [XX]
| Grade | Subject | Domain | SLO Code | Description |
|-------|---------|--------|----------|-------------|
| 09    | Physics | A      | P09A-01  | [Verbatim Text] |

📊 AUTO-REPAIR RULES:
- Missing Code: Generate based on current domain sequence.
- Missing Grade: Infer from header context.
- Formatting: Convert (1, 2, 3) to (-01, -02).
- Broken Sentences: Merge OCR-fragmented lines into single descriptive SLOs.

🚨 DEBUG REPORT:
Append a <DEBUG_REPORT> section at the end with a JSON object:
{
  "grade": "09",
  "domain_status": "A-Z Verified",
  "duplicates_fixed": [],
  "missing_sequences_filled": [],
  "auto_corrected": true
}`;

  const prompt = `
[COMMAND: SURGICAL INGESTION v110.0]
Process this multi-grade Physics/Curriculum grid.
1. Use Roman to Numeric conversion (IX -> 09).
2. Execute Vertical Column Reconstruction.
3. Apply Physics prefix "P" for Physics documents.
4. Use LaTeX $...$ for all math/science notation.

RAW OCR INPUT:
${rawText.substring(0, 900000)}

[FINAL DIRECTIVE]: Generate the verticalized Master MD and JSON Debug Report.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction,
        thinkingConfig: { thinkingBudget: 8192 }
      }
    });

    const output = response.text || "";
    // Detect if this is the new grid format for the reader
    const dialect = output.includes('| Grade |') ? 'Master-Grid-v110' : 'Standard-Linear';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${output}`;
  } catch (err) {
    console.error("❌ [Ingestion Engine Critical Fault]:", err);
    return `<!-- ERROR: SYNTHESIS FAILED -->\n${rawText}`;
  }
}