import { GoogleGenAI } from "@google/genai";

/**
 * WORLD-CLASS NEURAL STRUCTURER (v5.0)
 * Specialized for Multi-Grade Parallel Grids (Sindh / FBISE / International).
 * Feature: Parallel Column Unwrapping & Dialect Normalization.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
TASK: Convert the following raw curriculum text into a linearized "Master MD" file for high-precision RAG injection.

DIAGNOSTIC CONTEXT:
This text often contains "Progression Grids" where Grades IX, X, XI, and XII are in separate columns on the same page. 
OCR usually reads these row-by-row, scrambling the grades together.

UNWRAPPING PROTOCOL:
1. DETECT COLUMNS: Identify if text is from a parallel progression grid.
2. LINEARIZE: If a row contains "Grade IX [text] Grade X [text]...", split them into:
   # GRADE IX
   - SLO: [CODE]: [TEXT]
   # GRADE X
   - SLO: [CODE]: [TEXT]
3. HIERARCHY ENFORCEMENT:
   - Level 1: # [DOMAIN] (e.g., # Domain B: Molecular Biology)
   - Level 2: ## Standard: [Text]
   - Level 3: ### Benchmark [N]: [Text]
   - Level 4: - SLO: [CODE]: [Verbatim Description]
4. CODE CLEANUP: Ensure SLO codes follow the standard SUBJECT-GRADE-DOMAIN-NUMBER format (e.g., B-11-B-01).

DIALECT DETECTION:
- If "SLO" and "Benchmark" -> Dialect: Pakistan National
- If "AO" and "Strand" -> Dialect: Cambridge/International

RAW DATA STREAM:
${rawText.substring(0, 48000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.1,
        systemInstruction: "You are the Lead Curriculum Architect at EduNexus AI. Your mission is to produce a structurally perfect Markdown file that preserves the logic of parallel curriculum grids.",
      }
    });

    const masterMd = response.text || rawText;
    
    // Auto-labeling with higher logic
    let dialect = 'Standard Global';
    if (masterMd.includes('SLO') && (masterMd.includes('B-') || masterMd.includes('S-'))) dialect = 'Pakistani National (Sindh/Federal)';
    if (masterMd.includes('AO1') || masterMd.includes('IGCSE')) dialect = 'Cambridge Assessment';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Neural restructuring failed:", err);
    return rawText; 
  }
}