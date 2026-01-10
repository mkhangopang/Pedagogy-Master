
import { QueryAnalysis } from './query-analyzer';

/**
 * Format AI response instructions based on query analysis
 */
export function formatResponseInstructions(analysis: QueryAnalysis): string {
  const baseInstruction = `
🎯 USER QUERY ANALYSIS:
- Type: ${analysis.queryType.toUpperCase()}
- Intent: ${analysis.userIntent}
- Expected Length: ${analysis.expectedResponseLength.toUpperCase()} (${getWordCount(analysis.expectedResponseLength)} words)
${analysis.extractedSLO ? `- SLO Code: ${analysis.extractedSLO}` : ''}
`;

  switch (analysis.queryType) {
    case 'lookup': return baseInstruction + getLookupInstructions(analysis.extractedSLO);
    case 'teaching': return baseInstruction + getTeachingInstructions(analysis.extractedSLO);
    case 'lesson_plan': return baseInstruction + getLessonPlanInstructions(analysis.extractedSLO);
    case 'assessment': return baseInstruction + getAssessmentInstructions(analysis.extractedSLO);
    case 'differentiation': return baseInstruction + getDifferentiationInstructions(analysis.extractedSLO);
    default: return baseInstruction + getGeneralInstructions();
  }
}

function getWordCount(length: 'short' | 'medium' | 'long'): string {
  return { short: '50-150', medium: '200-500', long: '800-1500' }[length];
}

function getLookupInstructions(slo?: string): string {
  return `
📋 RESPONSE INSTRUCTIONS FOR SLO LOOKUP:
FORMAT (Keep it SHORT - 50-150 words max):
**SLO ${slo || '[code]'}:**
"[Exact quote from curriculum document]"
**What this means for teaching:**
[One sentence explaining the learning outcome in simple terms]
**Key concepts:**
- [Concept 1]
- [Concept 2]
- [Concept 3]
CRITICAL RULES:
❌ DO NOT provide full lesson plan.
❌ DO NOT include teaching activities.
❌ DO NOT include assessment strategies.
✅ ONLY provide: definition + brief explanation + key concepts.
`;
}

function getTeachingInstructions(slo?: string): string {
  return `
🎓 RESPONSE INSTRUCTIONS FOR TEACHING STRATEGIES:
FORMAT (Keep focused - 200-400 words):
**Teaching Strategies for ${slo || 'this SLO'}:**
1. **[Strategy Name]** ([Time])
   - [Brief description of activity]
2. **[Strategy Name]** ([Time])
   - [Brief description]
3. **Quick Assessment:**
   - [1-2 formative assessment ideas]
CRITICAL RULES:
✅ Provide 3-5 specific, actionable teaching strategies.
✅ Focus on student engagement.
❌ DO NOT create full lesson plan structure.
`;
}

function getLessonPlanInstructions(slo?: string): string {
  return `
📚 RESPONSE INSTRUCTIONS FOR COMPLETE LESSON PLAN:
FORMAT (Comprehensive - 800-1500 words):
# LESSON PLAN: ${slo || '[SLO Code]'}
## 1. LESSON OVERVIEW
## 2. LEARNING OBJECTIVES
## 3. MATERIALS & RESOURCES
## 4. ANTICIPATORY SET (Hook)
## 5. DIRECT INSTRUCTION
## 6. GUIDED PRACTICE
## 7. INDEPENDENT PRACTICE
## 8. ASSESSMENT
## 9. DIFFERENTIATION
## 10. CLOSURE
`;
}

function getAssessmentInstructions(slo?: string): string {
  return `
✅ RESPONSE INSTRUCTIONS FOR ASSESSMENT CREATION:
FORMAT (Focused - 300-500 words):
# ASSESSMENT: ${slo || '[SLO Code]'}
**Questions:**
1. [Question text] (X points)
   A) [Option] ...
**ANSWER KEY:**
1. Correct answer: [X]
`;
}

function getDifferentiationInstructions(slo?: string): string {
  return `
🎭 RESPONSE INSTRUCTIONS FOR DIFFERENTIATION STRATEGIES:
FORMAT (Practical - 200-400 words):
**Differentiation for ${slo || 'this SLO'}:**
### 🔵 Below Grade Level
### 🟢 At Grade Level
### 🟡 Above Grade Level
`;
}

function getGeneralInstructions(): string {
  return `
💬 RESPONSE INSTRUCTIONS FOR GENERAL QUERY:
Provide a helpful, focused response addressing the specific question using documents when relevant.
`;
}
