import { QueryAnalysis } from './query-analyzer';

/**
 * STRATEGIC RESPONSE FORMATTER (v36.0)
 * Optimized for Ultra-Deterministic Pedagogical Artefacts.
 */
export function formatResponseInstructions(analysis: QueryAnalysis, toolType?: string, docMetadata?: any): string {
  const metadataBlock = docMetadata ? `
## INSTITUTIONAL CONTEXT:
- AUTHORITY: ${docMetadata.authority}
- SUBJECT: ${docMetadata.subject}
- GRADE: ${docMetadata.grade_level}
` : '';

  if (toolType) {
    return metadataBlock + getToolSpecificInstructions(toolType, analysis.extractedSLO);
  }

  const baseInstruction = `
${metadataBlock}
🎯 USER QUERY ANALYSIS:
- Type: ${analysis.queryType.toUpperCase()}
- Expected Length: ${analysis.expectedResponseLength.toUpperCase()}
`;

  switch (analysis.queryType) {
    case 'lookup': return baseInstruction + getLookupInstructions();
    case 'teaching': return baseInstruction + getTeachingInstructions();
    case 'lesson_plan': return baseInstruction + getLessonPlanInstructions();
    default: return baseInstruction + "\nAddress the query using provided curriculum context.";
  }
}

function getToolSpecificInstructions(tool: string, slo?: string): string {
  switch (tool) {
    case 'lesson-plan':
      return `
### 🛠️ TOOL: MASTER LESSON SYNTHESIZER
1. **STRUCTURE**: Use the 5E Instructional Model.
2. **PHASE BLOCKS**: For each phase (Engage, Explore, Explain, Elaborate, Evaluate), you MUST include:
   - **Activity**: [Detailed instructional strategy]
   - **Alignment**: [How it connects to the Target SLO]
   - **Bloom's Taxonomy**: [Specific cognitive level(s)]
3. **DIFFERENTIATION**: Include specific strategies for Struggling and Advanced learners.
`;
    case 'slo-tagger':
      return `
### 🛠️ TOOL: NEURAL SLO AUDITOR
1. **DEEP AUDIT**: Scan the input for specific SLO matches in the vault.
2. **CONTEXTUAL INFERENCE**: Assign Bloom's level based on the entire standard clause.
3. **OUTPUT**: [CODE] | [BLOOM LEVEL] | [VERBATIM DESCRIPTION].
`;
    default:
      return "\nProceed with pedagogical synthesis.";
  }
}

function getLookupInstructions(): string {
  return `\nFORMAT: Definition + Brief Pedagogical Application. Use verbatim quote from vault if found.`;
}

function getTeachingInstructions(): string {
  return `\nFORMAT: 3-5 specific teaching strategies with time allocations and resource needs.`;
}

function getLessonPlanInstructions(): string {
  return getToolSpecificInstructions('lesson-plan');
}