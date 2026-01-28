/**
 * DEEP HIERARCHICAL CURRICULUM GENERATOR (v7.0)
 * Optimized for Sindh 2024 & International Standard Layouts.
 * Logic: Domain -> Standard -> Benchmark -> SLO
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

    // 2. STANDARD IDENTIFICATION (e.g., "Standard: Students should be able to:")
    const standardMatch = trimmed.match(/^(?:#+\s*)?Standard:\s*(.+)/i);
    if (standardMatch && currentDomain) {
      currentStandard = {
        description: standardMatch[1].trim(),
        benchmarks: []
      };
      currentDomain.standards.push(currentStandard);
      return;
    }

    // 3. BENCHMARK IDENTIFICATION (e.g., "Benchmark 1: Critically analyze...")
    const benchmarkMatch = trimmed.match(/^(?:#+\s*)?Benchmark\s+(\d+):\s*(.+)/i);
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

    // 4. SLO EXTRACTION (e.g., "- SLO:B-09-A-01: Concept of biology")
    const sloMatch = trimmed.match(/^- SLO\s*[:\s]*([^:\n]+)[:\s]*(.+)/i);
    if (sloMatch && currentBenchmark) {
      currentBenchmark.slos.push({
        code: sloMatch[1].trim(),
        text: sloMatch[2].trim()
      });
      result.totalSLOs++;
      return;
    }

    // Metadata capture for the document root
    if (trimmed.startsWith('Board:')) result.metadata.board = trimmed.split(':')[1].trim();
    if (trimmed.startsWith('Subject:')) result.metadata.subject = trimmed.split(':')[1].trim();
    if (trimmed.startsWith('Grade:')) result.metadata.grade = trimmed.split(':')[1].trim();
  });

  // Final push
  if (currentDomain) result.domains.push(currentDomain);

  return result;
}