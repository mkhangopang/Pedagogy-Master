
/**
 * ADAPTIVE CURRICULUM JSON GENERATOR (v3.0)
 * Converts hierarchical Markdown into a searchable pedagogical grid.
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
    
    // Adaptive Unit Detection
    if (trimmed.startsWith('# Unit') || trimmed.startsWith('# Chapter') || trimmed.startsWith('# Module')) {
      if (currentUnit) result.units.push(currentUnit);
      currentUnit = {
        title: trimmed.replace(/^#\s+(Unit|Chapter|Module|Section)[:\s\d-]*/i, '').trim(),
        outcomes: [],
        standards: []
      };
    }
    
    // Adaptive SLO Detection (e.g., - SLO:S1: Text or - SLO: S1: Text)
    const sloMatch = trimmed.match(/^- SLO\s*[:\s]*([^:\n]+)[:\s]*(.+)/i);
    if (sloMatch && currentUnit) {
      currentUnit.outcomes.push({
        id: sloMatch[1].trim(),
        text: sloMatch[2].trim()
      });
      result.totalOutcomes++;
    }

    // Adaptive Standard Detection
    if (trimmed.startsWith('### Standard:')) {
      const id = trimmed.replace('### Standard:', '').trim();
      if (currentUnit) {
        currentUnit.standards.push({ id });
        result.totalStandards++;
      }
    }
  });

  if (currentUnit) result.units.push(currentUnit);

  return result;
}
