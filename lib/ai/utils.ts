/**
 * AI UTILITIES
 * Robust extraction and cleaning logic for LLM outputs.
 */

export function extractJson(raw: string): any {
  if (!raw) return null;
  
  try {
    // 1. Try direct parse
    return JSON.parse(raw.trim());
  } catch (e) {
    // 2. Try to find JSON block using balanced braces or regex
    // This regex looks for the first { or [ and the last } or ]
    const match = raw.match(/(\{|\[)[\s\S]*(\}|\])/);
    if (match) {
      const candidate = match[0];
      try {
        return JSON.parse(candidate);
      } catch (e2) {
        // 3. Try to clean markdown and parse
        const clean = candidate.replace(/```json\n?|\n?```/g, '').trim();
        try {
          return JSON.parse(clean);
        } catch (e3) {
          // 4. Last ditch: remove any trailing commas before closing braces/brackets
          const superClean = clean
            .replace(/,\s*([\}\]])/g, '$1')
            .replace(/\\n/g, ' ')
            .trim();
          try {
            return JSON.parse(superClean);
          } catch (e4) {
            console.error("[JSON Extractor] All parsing attempts failed.");
            throw new Error("Invalid JSON format from AI node.");
          }
        }
      }
    }
    throw new Error("No JSON block found in AI response.");
  }
}

export function cleanMarkdown(text: string): string {
  return text.replace(/```[a-z]*\n?|\n?```/g, '').trim();
}
