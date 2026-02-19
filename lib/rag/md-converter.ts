import { getSynthesizer } from "../ai/synthesizer-core";

/**
 * MASTER CURRICULUM ARCHITECT (v162.0 - ORCHESTRATED)
 * Mission: 1:1 High-fidelity transformation with Grid Failover.
 */
export async function convertToPedagogicalMarkdown(rawText: string): Promise<string> {
  const synth = getSynthesizer();
  
  const systemInstruction = `# UNIVERSAL CURRICULUM EXTRACTION PROTOCOL v162

You are a world-class curriculum ingestor. Your mission is to linearize curriculum PDFs into clean Markdown ledger files.

### 🏗️ HIERARCHY & SEQUENCE
1. **Metadata**: Header '# Curriculum Metadata' followed by Board, Subject, Grade, Version.
2. **Grade Sections**: Use '# GRADE [XX]' (e.g. # GRADE 09).
3. **Domains**: Use '### DOMAIN [X]: [Title]' (e.g. ### DOMAIN A: Life Sciences).

### 🧬 ATOMIC SLO TAGGING
You MUST tag every learning outcome using this exact format:
- [SLO:S-GG-D-NN] | [BLOOM_LEVEL] : [Full Exact Text]

### 📊 DATA VAULT INDEX
At the VERY END, provide a JSON block of ALL found SLOs wrapped in <STRUCTURED_INDEX> tags.`;

  const prompt = `[SYNTHESIS_REQUEST] Convert the following raw curriculum text into a Master Markdown Ledger. 
  Linearize EVERY domain and EVERY SLO without exception.
  
  DOCUMENT BUFFER:
  ${rawText.substring(0, 100000)}`;

  try {
    const result = await synth.synthesize(prompt, {
      systemPrompt: systemInstruction,
      complexity: 2 // Uses Tier-2 Flash or Llama 3.3 for high-speed transformation
    });

    return result.text || "<!-- INGESTION_FAILURE -->";
  } catch (err) {
    console.error("❌ [Architect Node Error]:", err);
    return `<!-- ERROR: NEURAL GATEWAY TIMEOUT -->\n${rawText}`;
  }
}
