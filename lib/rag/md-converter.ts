import { GoogleGenAI } from "@google/genai";

/**
 * NEURAL MASTER-MD CONSTRUCT (v2.0)
 * Logic: Polymorphic Ingestion -> Standardized Pedagogical Markdown.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
TASK: Convert this raw pedagogical text into a high-fidelity "Master MD" file for RAG injection.

DIALECT DETECTION:
1. SINDH/FEDERAL: Use "Domains", "Standards", "Benchmarks", and "- SLO: [CODE]: [TEXT]".
2. CAMBRIDGE/OXFORD: Use "Assessment Objectives (AO)", "Strands", and "Learning Outcomes".
3. IB/GLOBAL: Use "Inquiry Points", "Key Concepts", and "Competencies".

FORMATTING PROTOCOL:
- Level 1: # [DOMAIN / UNIT NAME]
- Level 2: ## [STANDARD / STRAND]
- Level 3: ### [BENCHMARK / AO]
- LEVEL 4 (ATOMIC): Each specific objective MUST start with "- SLO:" followed by its code.
  Example: - SLO: B-11-B-27: Describe DNA replication.
- NOISE REMOVAL: Strip all page numbers, footers, institutional logos, and table of contents.

RAW TEXT STREAM:
${rawText.substring(0, 50000)}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.1,
        systemInstruction: "You are a world-class curriculum data architect. Your output is a structured MD file that preserves 100% of the instructional intent while optimizing for machine retrieval.",
      }
    });

    const masterMd = response.text || rawText;
    
    // Auto-labeling logic: Inject a system header
    const dialect = masterMd.includes('AO') ? 'Cambridge/IGCSE' : masterMd.includes('S-') || masterMd.includes('B-') ? 'Pakistani National' : 'General IB/Global';
    
    return `<!-- MASTER_MD_DIALECT: ${dialect} -->\n${masterMd}`;
  } catch (err) {
    console.error("❌ [MD Converter] Neural structuring failed:", err);
    return rawText; 
  }
}