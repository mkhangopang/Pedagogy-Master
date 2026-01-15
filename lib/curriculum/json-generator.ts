
/**
 * ADAPTIVE CURRICULUM JSON GENERATOR (v4.0)
 * Optimized for multi-level hierarchical curricula.
 */
export function generateCurriculumJson(markdown: string) {
  const lines = markdown.split('\n');
  const result: any = {
    units: [],
    totalStandards: 0,
    totalOutcomes: 0
  };

  let currentUnit: any = null;

  lines.forEach(line => {
    const trimmed = line.trim();
    
    // Adaptive Unit/Domain Detection (1-3 hashes)
    if (trimmed.match(/^#{1,3}\s+(Unit|Chapter|Module|Section|Domain|Grade|Grade\s+\w+)\b/i)) {
      if (currentUnit) result.units.push(currentUnit);
      currentUnit = {
        title: trimmed.replace(/^#{1,3}\s+(Unit|Chapter|Module|Section|Domain|Grade)[:\s\d-]*/i, '').trim(),
        outcomes: [],
        standards: []
      };
    }
    
    // Adaptive SLO Detection
    const sloMatch = trimmed.match(/^- SLO\s*[:\s]*([^:\n]+)[:\s]*(.+)/i);
    if (sloMatch && currentUnit) {
      currentUnit.outcomes.push({
        id: sloMatch[1].trim(),
        text: sloMatch[2].trim()
      });
      result.totalOutcomes++;
    }

    // Adaptive Standard Detection (2-4 hashes)
    if (trimmed.match(/^#{2,4}\s+Standard:/i)) {
      const id = trimmed.replace(/^#{2,4}\s+Standard:\s*/i, '').trim();
      if (currentUnit) {
        currentUnit.standards.push({ id });
        result.totalStandards++;
      }
    }
  });

  if (currentUnit) result.units.push(currentUnit);

  return result;
}
