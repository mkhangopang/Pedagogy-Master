import { QueryAnalysis } from './query-analyzer';

/**
 * STRATEGIC RESPONSE FORMATTER (v34.0)
 * Optimized for Neural Pedagogical Synthesis.
 */
export function formatResponseInstructions(analysis: QueryAnalysis, toolType?: string, docMetadata?: any): string {
  const metadataBlock = docMetadata ? `
## INSTITUTIONAL CONTEXT:
- BOARD/AUTHORITY: ${docMetadata.authority}
- SUBJECT: ${docMetadata.subject}
- GRADE LEVEL: ${docMetadata.grade_level}
- VERSION: ${docMetadata.version_year}
` : '';

  if (toolType) {
    return metadataBlock + getToolSpecificInstructions(toolType, analysis.extractedSLO);
  }

  const baseInstruction = `
${metadataBlock}
🎯 USER QUERY ANALYSIS:
- Type: ${analysis.queryType.toUpperCase()}
- Intent: ${analysis.userIntent}
- Expected Length: ${analysis.expectedResponseLength.toUpperCase()}
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

function getToolSpecificInstructions(tool: string, slo?: string): string {
  switch (tool) {
    case 'lesson-plan':
      return `
### 🛠️ TOOL: ADVANCED LESSON SYNTHESIZER
1. **ANCHOR**: Locate specific SLO in <AUTHORITATIVE_VAULT>.
2. **OBJECTIVE**: Start with "Target SLO: [CODE] - [VERBATIM DESCRIPTION]".
3. **STRUCTURE**: Use 5E Instructional Model.
4. **ALIGNMENT**: Every activity MUST cite the standard clause.
`;
    case 'assessment':
      return `
### 🛠️ TOOL: NEURAL ASSESSMENT GENERATOR
1. **SOURCE**: Use ONLY content from <AUTHORITATIVE_VAULT>.
2. **DISTRACTORS**: Base distractors on common misconceptions.
3. **MAPPING**: Include: "[Aligned to: SLO Code | Bloom's Level]".
`;
    case 'rubric':
      return `
### 🛠️ TOOL: CRITERIA & RUBRIC BUILDER
1. **VERBS**: Identify cognitive verbs in vault SLOs.
2. **SCALING**: 4-level rubric (Exceptional, Proficient, Developing, Beginning).
`;
    case 'slo-tagger':
      return `
### 🛠️ TOOL: WORLD-CLASS NEURAL SLO TAGGER
1. **DEEP AUDIT**: Scan the input and locate the exact Student Learning Objective (SLO) in the <AUTHORITATIVE_VAULT>.
2. **CONTEXTUAL INFERENCE (CRITICAL)**: Assign a Bloom's Taxonomy level (Remember, Understand, Apply, Analyze, Evaluate, Create) by analyzing the **ENTIRE CLAUSE**. 
   - *RULE*: Do NOT just match the verb. If the SLO says "Understand the process of photosynthesis by modeling the electron chain," the level is **CREATE/ANALYZE**, not just Understand.
   - *AUDIT*: Evaluate the cognitive demand required to achieve the outcome.
3. **KEYWORD EXTRACTION**: List 3-5 high-fidelity technical keywords.
4. **OUTPUT FORMAT**: 
   - [SLO CODE] | [BLOOM LEVEL]
   - **Verbatim Standard**: [Full Description from Vault]
   - **Keywords**: [List]
   - **Neural Alignment Note**: Provide a deep pedagogical reasoning for the assigned cognitive level based on the structural complexity of the standard.
`;
    default:
      return "\nProceed with pedagogical synthesis anchored to the provided curriculum assets.";
  }
}

function getLookupInstructions(slo?: string): string {
  return `
📋 SLO LOOKUP:
FORMAT: Definition + Brief Pedagogical Application.
CRITICAL: Use verbatim quote from vault.
`;
}

function getTeachingInstructions(slo?: string): string {
  return `
🎓 TEACHING STRATEGIES:
FORMAT: 3-5 actionable strategies with time allocations. Prioritize evidence-based active learning.
`;
}

function getLessonPlanInstructions(slo?: string): string {
  return getToolSpecificInstructions('lesson-plan', slo);
}

function getAssessmentInstructions(slo?: string): string {
  return getToolSpecificInstructions('assessment', slo);
}

function getDifferentiationInstructions(slo?: string): string {
  return `
🎭 DIFFERENTIATION:
Provide Support (Tier 1), At-Level (Tier 2), and Extension (Tier 3) strategies.
`;
}

function getGeneralInstructions(): string {
  return `
💬 GENERAL QUERY:
Provide a helpful, focused response addressing the specific question using documents.
`;
}