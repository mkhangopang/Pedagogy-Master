/**
 * NEURAL TOOL ROUTER (v4.0 - EXPERT EDITION)
 * Logic: Weighted keyword signal analysis to route queries to specialized expert nodes.
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
      keywords: ['lesson', 'plan', 'teach', 'activity', 'instruction', '5e', 'madeline hunter', 'ubd', 'class', 'pedagogy', 'architecture', 'curriculum map'],
      phrases: ['how to teach', 'create a plan', 'instructional architecture', 'design a lesson']
    },
    neural_quiz: {
      score: 0,
      keywords: ['quiz', 'test', 'question', 'assessment', 'mcq', 'exam', 'crq', 'formative', 'summative', 'check for understanding', 'answer key'],
      phrases: ['generate questions', 'make a quiz', 'test items', 'standards-aligned quiz']
    },
    fidelity_rubric: {
      score: 0,
      keywords: ['rubric', 'scoring', 'grading', 'criteria', 'descriptor', 'performance task', 'success criteria', 'marking', 'criterion'],
      phrases: ['create a rubric', 'grade this', 'analytical rubric', 'fidelity rubric']
    },
    audit_tagger: {
      score: 0,
      keywords: ['analyze', 'bloom', 'slo', 'curriculum', 'cognitive', 'dok', 'audit', 'mapping', 'gap analysis', 'tagger', 'logic mapping'],
      phrases: ['tag this', 'align to standards', 'audit report', 'curriculum analysis']
    }
  };

  Object.entries(toolSignatures).forEach(([tool, sig]) => {
    sig.keywords.forEach(kw => { if (query.includes(kw)) sig.score += 2; });
    sig.phrases.forEach(ph => { if (query.includes(ph)) sig.score += 5; });
  });

  const sorted = Object.entries(toolSignatures).sort((a, b) => b[1].score - a[1].score);
  const bestTool = (sorted[0][1].score > 0 ? sorted[0][0] : 'master_plan') as ToolType;
  const bestScore = sorted[0][1].score;
  
  const totalScore = Object.values(toolSignatures).reduce((acc, s) => acc + s.score, 0);
  const confidence = totalScore > 0 ? bestScore / totalScore : 0.5;

  return {
    tool: bestTool,
    confidence: bestScore > 0 ? confidence : 0.5,
    reasoning: `Routed to ${bestTool} via Brain v4.0 Signal Logic.`
  };
}

export function getToolDisplayName(toolId: ToolType | string | null): string {
  if (!toolId) return 'Synthesis Engine';
  const names: Record<string, string> = {
    master_plan: 'Master Plan',
    neural_quiz: 'Neural Quiz',
    fidelity_rubric: 'Fidelity Rubric',
    audit_tagger: 'Audit Tagger'
  };
  return names[toolId as string] || 'Expert Node';
}
