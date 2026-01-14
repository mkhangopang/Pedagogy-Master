
/**
 * CURRICULUM JSON GENERATOR
 * Converts validated Markdown into a structured navigation object.
 */
export function generateCurriculumJson(markdown: string) {
  const lines = markdown.split('\n');
  const result: any = {
    units: [],
    totalStandards: 0
  };

  let currentUnit: any = null;

  lines.forEach(line => {
    const trimmed = line.trim();
    
    // Detect Units
    if (trimmed.startsWith('# Unit')) {
      if (currentUnit) result.units.push(currentUnit);
      currentUnit = {
        title: trimmed.replace('# Unit', '').trim(),
        outcomes: [],
        standards: []
      };
    }
    
    // Detect Learning Outcomes
    if (trimmed.startsWith('- SLO')) {
      const parts = trimmed.split(':');
      if (currentUnit) {
        currentUnit.outcomes.push({
          id: parts[0].replace('-', '').trim(),
          text: parts[1]?.trim() || ''
        });
      }
    }

    // Detect Standards
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
