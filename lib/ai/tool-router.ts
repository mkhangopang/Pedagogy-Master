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
      keywords: ['lesson', 'plan', 'teach', 'activity', 'instruction', '5e', 'madeline hunter', 'ubd', 'class', 'pedagogy', 'curriculum map', 'scaffold', 'modeling', 'anticipatory', 'hook'],
      phrases: ['how to teach', 'create a plan', 'lesson for', 'instructional sequence', 'design a class']
    },
    neural_quiz: {
      score: 0,
      keywords: ['quiz', 'test', 'question', 'assessment', 'mcq', 'exam', 'formative', 'summative', 'check for understanding', 'distractor', 'answer key', 'items'],
      phrases: ['generate questions', 'make a quiz', 'test items', 'evaluate mastery', 'summative evaluation']
    },
    fidelity_rubric: {
      score: 0,
      keywords: ['rubric', 'scoring', 'grading', 'criteria', 'evaluate', 'scale', 'descriptor', 'performance task', 'success criteria', 'marking', 'competency'],
      phrases: ['create a rubric', 'grade this', 'how to score', 'marking guide', 'analytical rubric']
    },
    audit_tagger: {
      score: 0,
      keywords: ['analyze', 'bloom', 'slo', 'curriculum', 'cognitive', 'dok', 'standard', 'alignment', 'mapping', 'audit', 'vertical alignment', 'gap analysis'],
      phrases: ['tag this', 'align to standards', 'check slo', 'mapping standards', 'identify gaps']
    }
  };

  // 1. Calculate weighted scores (Keywords = 2, Multi-word Phrases = 5)
  Object.entries(toolSignatures).forEach(([tool, sig]) => {
    sig.keywords.forEach(kw => { if (query.includes(kw)) sig.score += 2; });
    sig.phrases.forEach(ph => { if (query.includes(ph)) sig.score += 5; });
  });

  // 2. Resolve highest signal
  const sorted = Object.entries(toolSignatures).sort((a, b) => b[1].score - a[1].score);
  const bestTool = (sorted[0][1].score > 0 ? sorted[0][0] : 'master_plan') as ToolType;
  const bestScore = sorted[0][1].score;
  
  // 3. Confidence Calculation
  const totalScore = Object.values(toolSignatures).reduce((acc, s) => acc + s.score, 0);
  const confidence = totalScore > 0 ? bestScore / totalScore : 0.5;

  return {
    tool: bestTool,
    confidence: bestScore > 0 ? confidence : 0.5,
    reasoning: `Detected "${bestTool}" via ${bestScore} pedagogical weight signals.`
  };
}

export function getToolDisplayName(toolId: ToolType | string | null): string {
  if (!toolId) return 'Synthesis Engine';
  const names: Record<string, string> = {
    master_plan: 'Instructional Architect',
    neural_quiz: 'Assessment Scientist',
    fidelity_rubric: 'Evaluation Engineer',
    audit_tagger: 'Curriculum Auditor'
  };
  return names[toolId as string] || 'Expert Node';
}