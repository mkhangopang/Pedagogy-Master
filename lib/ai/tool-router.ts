
/**
 * NEURAL TOOL ROUTER (v4.0)
 * Logic: Weighted signal analysis to map queries to specialized expert nodes.
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
      score: 0,
      keywords: ['lesson', 'plan', 'teach', 'activity', 'instruction', '5e', 'madeline hunter', 'ubd', 'class', 'pedagogy', 'curriculum map'],
      phrases: ['how to teach', 'create a plan', 'lesson for', 'sequence of learning']
    },
    neural_quiz: {
      score: 0,
      keywords: ['quiz', 'test', 'question', 'assessment', 'mcq', 'exam', 'formative', 'summative', 'check for understanding', 'assessment item'],
      phrases: ['generate questions', 'make a quiz', 'test items', 'evaluate mastery']
    },
    fidelity_rubric: {
      score: 0,
      keywords: ['rubric', 'scoring', 'grading', 'criteria', 'evaluate', 'scale', 'descriptor', 'performance task', 'success criteria'],
      phrases: ['create a rubric', 'grade this', 'how to score', 'marking guide']
    },
    audit_tagger: {
      score: 0,
      keywords: ['analyze', 'bloom', 'slo', 'curriculum', 'cognitive', 'dok', 'standard', 'alignment', 'mapping', 'audit', 'vertical alignment'],
      phrases: ['tag this', 'align to standards', 'check slo', 'mapping standards']
    }
  };

  // 1. Calculate weighted scores
  Object.entries(toolSignatures).forEach(([tool, sig]) => {
    sig.keywords.forEach(kw => { if (query.includes(kw)) sig.score += 2; });
    sig.phrases.forEach(ph => { if (query.includes(ph)) sig.score += 5; });
  });

  // 2. Resolve highest signal
  const sorted = Object.entries(toolSignatures).sort((a, b) => b[1].score - a[1].score);
  const bestTool = sorted[0][0] as ToolType;
  const bestScore = sorted[0][1].score;
  
  // 3. Confidence Calculation
  const totalScore = Object.values(toolSignatures).reduce((acc, s) => acc + s.score, 0);
  const confidence = totalScore > 0 ? bestScore / totalScore : 0.5;

  return {
    tool: bestTool,
    confidence: bestScore > 0 ? confidence : 0.5,
    reasoning: `Found ${bestScore} weighted signals for ${bestTool}.`
  };
}

export function getToolDisplayName(toolId: ToolType | null): string {
  if (!toolId) return 'Synthesis Engine';
  const names = {
    master_plan: 'Master Plan Architect',
    neural_quiz: 'Assessment Scientist',
    fidelity_rubric: 'Evaluation Engineer',
    audit_tagger: 'Standards Auditor'
  };
  return names[toolId];
}
