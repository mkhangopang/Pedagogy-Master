import { extractSLOCodes, normalizeSLO } from './slo-extractor';

export interface ParsedQuery {
  sloCodes: string[];
  grades: string[];
  topics: string[];
  bloomLevel?: string;
  difficultyPreference?: string;
  raw: string;
}

/**
 * NEURAL QUERY PARSER (v4.0)
 * Decodes teacher intent with canonical SLO support.
 */
export function parseUserQuery(query: string): ParsedQuery {
  const lower = query.toLowerCase();
  
  // 1. SLO Extraction (Normalized format S08C03)
  const sloCodes = extractSLOCodes(query);

  // 2. Grade Level Extraction
  const gradePatterns = [
    /(?:grade|class|level|yr|year|gr)\s*(\d{1,2})/gi,
    /(?:grade|class|level|yr|year|gr)\s*(IV|V|VI|VII|VIII|IX|X)/gi
  ];
  
  const gradesSet = new Set<string>();
  gradePatterns.forEach(pattern => {
    const matches = Array.from(query.matchAll(pattern));
    matches.forEach(m => {
      const g = m[1].toUpperCase();
      if (g === 'IV') gradesSet.add('4');
      else if (g === 'V') gradesSet.add('5');
      else if (g === 'VI') gradesSet.add('6');
      else if (g === 'VII') gradesSet.add('7');
      else if (g === 'VIII') gradesSet.add('8');
      else gradesSet.add(g);
    });
  });

  // 3. STEM Topic Extraction
  const commonTopics = [
    'photosynthesis', 'energy', 'force', 'cells', 'ecosystem', 'matter', 
    'water cycle', 'weather', 'space', 'electricity', 'human body', 
    'plants', 'animals', 'chemistry', 'physics', 'biology', 'gravity', 'dna', 'genetics'
  ];
  const topics = commonTopics.filter(t => lower.includes(t));

  // 4. Bloom's Taxonomy Detection
  const bloomVerbs: Record<string, string[]> = {
    'Remember': ['define', 'list', 'what is', 'recall', 'identify'],
    'Understand': ['explain', 'describe', 'summarize', 'classify'],
    'Apply': ['solve', 'apply', 'demonstrate', 'how to use'],
    'Analyze': ['analyze', 'compare', 'contrast', 'differentiate'],
    'Evaluate': ['evaluate', 'justify', 'critique', 'assess'],
    'Create': ['design', 'develop', 'create', 'synthesize']
  };

  let bloomLevel: string | undefined;
  for (const [level, verbs] of Object.entries(bloomVerbs)) {
    if (verbs.some(v => lower.includes(v))) {
      bloomLevel = level;
      break;
    }
  }

  // 5. Difficulty preference
  let difficultyPreference: string | undefined;
  if (lower.includes('struggling') || lower.includes('support') || lower.includes('easy')) {
    difficultyPreference = 'Low';
  } else if (lower.includes('advanced') || lower.includes('challenge') || lower.includes('gifted')) {
    difficultyPreference = 'High';
  }

  return {
    sloCodes,
    grades: Array.from(gradesSet),
    topics,
    bloomLevel,
    difficultyPreference,
    raw: query
  };
}