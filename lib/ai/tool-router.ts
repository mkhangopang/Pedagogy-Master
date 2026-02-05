
/**
 * NEURAL TOOL ROUTER (v4.0)
 * Logic: Analyzes user intent to map queries to specialized pedagogical expert nodes.
 */

export type ToolType = 'master_plan' | 'neural_quiz' | 'fidelity_rubric' | 'audit_tagger';

interface ToolRoute {
  tool: ToolType;
  confidence: number;
  reasoning: string;
}

export function detectToolIntent(userQuery: string): ToolRoute {
  const query = userQuery.toLowerCase();
  
  const toolSignatures = {
    master_plan: {
      weight: 0,
      keywords: ['lesson', 'plan', 'teach', 'activity', 'instruction', '5e', 'madeline hunter', 'ubd', 'class', 'pedagogy'],
      phrases: ['how to teach', 'create a plan', 'lesson for']
    },
    neural_quiz: {
      weight: 0,
      keywords: ['quiz', 'test', 'question', 'assessment', 'mcq', 'exam', 'formative', 'summative', 'check for understanding'],
      phrases: ['generate questions', 'make a quiz', 'test items']
    },
    fidelity_rubric: {
      weight: 0,
      keywords: ['rubric', 'scoring', 'grading', 'criteria', 'evaluate', 'scale', 'descriptor', 'performance task'],
      phrases: ['create a rubric', 'grade this', 'success criteria']
    },
    audit_tagger: {
      weight: 0,
      keywords: ['analyze', 'bloom', 'slo', 'curriculum', 'cognitive', 'dok', 'standard', 'alignment', 'mapping', 'audit'],
      phrases: ['tag this', 'align to standards', 'check slo']
    }
  };

  // Calculate scores
  Object.entries(toolSignatures).forEach(([tool, sig]) => {
    sig.keywords.forEach(kw => { if (query.includes(kw)) sig.weight += 1; });
    sig.phrases.forEach(ph => { if (query.includes(ph)) sig.weight += 3; });
  });

  const sortedTools = Object.entries(toolSignatures)
    .sort((a, b) => b[1].weight - a[1].weight);

  const bestTool = sortedTools[0][0] as ToolType;
  const bestWeight = sortedTools[0][1].weight;
  
  // Normalizing confidence
  const totalWeight = Object.values(toolSignatures).reduce((acc, s) => acc + s.weight, 0);
  const confidence = totalWeight > 0 ? bestWeight / totalWeight : 0;

  return {
    tool: bestTool,
    confidence: bestWeight > 0 ? confidence : 0.5, // Default to most likely if weight is 0
    reasoning: `Matched ${bestWeight} neural signals for ${bestTool}.`
  };
}

export function getToolDisplayName(toolId: ToolType): string {
  const names = {
    master_plan: 'Master Plan',
    neural_quiz: 'Neural Quiz',
    fidelity_rubric: 'Fidelity Rubric',
    audit_tagger: 'Audit Tagger'
  };
  return names[toolId];
}
