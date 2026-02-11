import { GoogleGenAI } from "@google/genai";

/**
 * WORLD-CLASS NEURAL STRUCTURER (v11.0)
 * Specialized for Multi-Grade Parallel Curriculum Grids.
 * FEATURE: Optimized speed for Ingestion Timeout mitigation.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Use Flash for extraction speed and reliability on high-volume text
  const modelName = 'gemini-3-flash-preview';
  
  const prompt = `
TASK: Linearize and structure this chaotic OCR curriculum text into a clean hierarchical Markdown file.

RECONSTRUCTION PROTOCOL:
1. IDENTIFY IDENTITY [STRICT]: Analyze headers to determine EXACT Subject (e.g., English, Biology). 
2. UNROLL COLUMNS: Separate text into Grade-specific blocks (e.g., IX, X, XI, XII).
3. HIERARCHY MAPPING: Maintain structure: Domain -> Standard -> Benchmark -> SLO.
4. SLO FORMAT: Every outcome MUST be exactly: "SLO: [CODE]: [FULL TEXT]" on its own line.
5. NEURAL RECOVERY: If OCR is garbled, use your regional curriculum knowledge to restore the correct wording for that specific code.

RAW TEXT DATA:
${rawText.substring(0, 150000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction: "You are a master curriculum engineer. You transform chaotic raw text into structured pedagogical markdown with 100% accuracy in subject identification.",
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const masterMd = response.text || rawText;
    
    let subject = 'Curriculum';
    const lowerMd = masterMd.toLowerCase();
    if (lowerMd.includes('english')) subject = 'English';
    else if (lowerMd.includes('biology')) subject = 'Biology';
    else if (lowerMd.includes('science')) subject = 'Science';
    
    return `<!-- MASTER_MD_SUBJECT: ${subject} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Neural node fault:", err);
    return rawText;
  }
}