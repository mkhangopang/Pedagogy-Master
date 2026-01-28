/**
 * DEEP HIERARCHICAL CURRICULUM GENERATOR (v8.0)
 * Specialized for Sindh Progression Grids (Grades IX-XII).
 * Logic: Domain -> Standard -> Benchmark -> SLO (with Grade Attribution)
 */
export function generateCurriculumJson(markdown: string) {
  const lines = markdown.split('\n');
  const result: any = {
    metadata: {},
    domains: [],
    totalDomains: 0,
    totalBenchmarks: 0,
    totalSLOs: 0
  };

  let currentDomain: any = null;
  let currentStandard: any = null;
  let currentBenchmark: any = null;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // 1. DOMAIN IDENTIFICATION (e.g., "DOMAIN A: NATURE OF SCIENCE")
    const domainMatch = trimmed.match(/^(?:#+\s*)?DOMAIN\s+([A-Z]):\s*(.+)/i);
    if (domainMatch) {
      if (currentDomain) result.domains.push(currentDomain);
      currentDomain = {
        code: domainMatch[1].toUpperCase(),
        title: domainMatch[2].trim(),
        standards: []
      };
      result.totalDomains++;
      currentStandard = null;
      currentBenchmark = null;
      return;
    }

    // 2. STANDARD IDENTIFICATION
    const standardMatch = trimmed.match(/^(?:#{2,4}\s*)?Standard:\s*(.+)/i);
    if (standardMatch && currentDomain) {
      currentStandard = {
        description: standardMatch[1].trim(),
        benchmarks: []
      };
      currentDomain.standards.push(currentStandard);
      return;
    }

    // 3. BENCHMARK IDENTIFICATION
    const benchmarkMatch = trimmed.match(/^(?:#{3,5}\s*)?Benchmark\s+(\d+):\s*(.+)/i);
    if (benchmarkMatch && currentStandard) {
      currentBenchmark = {
        index: benchmarkMatch[1],
        description: benchmarkMatch[2].trim(),
        slos: []
      };
      currentStandard.benchmarks.push(currentBenchmark);
      result.totalBenchmarks++;
      return;
    }

    // 4. SINDH SLO EXTRACTION (e.g., "- SLO:B-09-A-01: Description")
    const sloMatch = trimmed.match(/^- SLO\s*[:\s]*([A-Z]-\d{2}-[A-Z]-\d{2})[:\s]*(.+)/i);
    if (sloMatch && currentBenchmark) {
      const code = sloMatch[1].trim();
      const grade = code.split('-')[1]; // Extracts "09" from "B-09-A-01"
      
      currentBenchmark.slos.push({
        code: code,
        text: sloMatch[2].trim(),
        grade: grade
      });
      result.totalSLOs++;
      return;
    }

    // 5. LEGACY SLO EXTRACTION
    const legacySloMatch = trimmed.match(/^- SLO\s*[:\s]*([^:\n]+)[:\s]*(.+)/i);
    if (legacySloMatch && currentBenchmark && !sloMatch) {
      currentBenchmark.slos.push({
        code: legacySloMatch[1].trim(),
        text: legacySloMatch[2].trim()
      });
      result.totalSLOs++;
      return;
    }

    // Metadata capture
    if (trimmed.startsWith('Board:')) result.metadata.board = trimmed.split(':')[1].trim();
    if (trimmed.startsWith('Subject:')) result.metadata.subject = trimmed.split(':')[1].trim();
    if (trimmed.startsWith('Grade:')) result.metadata.grade = trimmed.split(':')[1].trim();
  });

  if (currentDomain) result.domains.push(currentDomain);

  return result;
}