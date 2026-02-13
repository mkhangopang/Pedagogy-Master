
import { extractSLOCodes, normalizeSLO } from './slo-extractor';

export interface ParsedQuery {
  sloCodes: string[];
  grades: string[];
  topics: string[];
  bloomLevel?: string;
  difficultyPreference?: string;
  subjectHint?: string;
  raw: string;
}

/**
 * WORLD-CLASS NEURAL QUERY PARSER (v5.0)
 * Optimized for Alphanumeric Identifiers and Fuzzy Grade Mapping.
 */
export function parseUserQuery(query: string): ParsedQuery {
  const lower = query.toLowerCase();
  
  // 1. ADVANCED SLO EXTRACTION
  const extractedObjects = extractSLOCodes(query);
  const sloCodes = extractedObjects.map(o => o.code);

  // 2. FUZZY GRADE MAPPING (ix -> 9, xi -> 11, etc.)
  const gradeMap: Record<string, string> = {
    'ix': '09', '9': '09', 'x': '10', '10': '10',
    'xi': '11', '11': '11', 'xii': '12', '12': '12',
    'iv': '04', '4': '04', 'v': '05', '5': '05',
    'vi': '06', '6': '06', 'vii': '07', '7': '07',
    'viii': '08', '8': '08'
  };
  
  const gradesSet = new Set<string>();
  const gradeWords = lower.match(/\b(ix|x|xi|xii|iv|v|vi|vii|viii|\d{1,2})\b/g) || [];
  gradeWords.forEach(w => {
    if (gradeMap[w]) gradesSet.add(gradeMap[w]);
  });

  // 3. SUBJECT DISCOVERY
  const subjects = ['biology', 'physics', 'chemistry', 'science', 'math', 'english'];
  const subjectHint = subjects.find(s => lower.includes(s));

  // 4. STEM TOPIC EXTRACTION
  const commonTopics = [
    'photosynthesis', 'energy', 'force', 'cells', 'ecosystem', 'matter', 
    'water cycle', 'weather', 'space', 'electricity', 'human body', 
    'plants', 'animals', 'gravity', 'dna', 'genetics', 'metabolism'
  ];
  const topics = commonTopics.filter(t => lower.includes(t));

  // 5. BLOOM'S TAXONOMY DETECTION (High-Fidelity)
  const bloomVerbs: Record<string, string[]> = {
    'Remember': ['define', 'list', 'state', 'recall', 'identify'],
    'Understand': ['explain', 'describe', 'summarize', 'classify', 'interpret'],
    'Apply': ['solve', 'apply', 'demonstrate', 'calculate'],
    'Analyze': ['analyze', 'compare', 'contrast', 'differentiate', 'examine'],
    'Evaluate': ['evaluate', 'justify', 'critique', 'assess', 'defend'],
    'Create': ['design', 'develop', 'create', 'synthesize', 'formulate']
  };

  let bloomLevel: string | undefined;
  for (const [level, verbs] of Object.entries(bloomVerbs)) {
    if (verbs.some(v => lower.includes(v))) {
      bloomLevel = level;
      break;
    }
  }

  return {
    sloCodes,
    grades: Array.from(gradesSet),
    topics,
    bloomLevel,
    subjectHint,
    raw: query
  };
}
