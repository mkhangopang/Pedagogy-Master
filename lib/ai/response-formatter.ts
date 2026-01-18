
import { QueryAnalysis } from './query-analyzer';

/**
 * STRATEGIC RESPONSE FORMATTER (v32.0)
 * Optimized for Tool-based Pedagogical Synthesis.
 */
export function formatResponseInstructions(analysis: QueryAnalysis, toolType?: string, docMetadata?: any): string {
  const metadataBlock = docMetadata ? `
## INSTITUTIONAL CONTEXT:
- BOARD/AUTHORITY: ${docMetadata.authority}
- SUBJECT: ${docMetadata.subject}
- GRADE LEVEL: ${docMetadata.grade_level}
- VERSION: ${docMetadata.version_year}
` : '';

  // If a specific tool is active, use the Tool Synthesis Engine
  if (toolType) {
    return metadataBlock + getToolSpecificInstructions(toolType, analysis.extractedSLO);
  }

  // Fallback to general query analysis
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
1. **ANCHOR**: Locate the specific SLO in the <AUTHORITATIVE_VAULT> matching "${slo || 'the requested topic'}".
2. **OBJECTIVE**: Start with "Target SLO: [CODE] - [VERBATIM DESCRIPTION FROM VAULT]".
3. **STRUCTURE**: Use the 5E Instructional Model exclusively.
4. **ALIGNMENT**: Every activity MUST cite which part of the standard it addresses.
5. **UDL**: Include specific scaffolds for the difficulty level found in metadata.
`;
    case 'assessment':
      return `
### 🛠️ TOOL: NEURAL ASSESSMENT GENERATOR
1. **SOURCE**: Use ONLY content and vocabulary found in the <AUTHORITATIVE_VAULT>.
2. **DISTRACTORS**: For MCQs, ensure distractors are based on common misconceptions for this specific subject.
3. **MAPPING**: For every question, include a line: "[Aligned to: SLO Code | Bloom's Level]".
4. **KEY**: Provide a high-fidelity answer key with pedagogical explanations.
`;
    case 'rubric':
      return `
### 🛠️ TOOL: CRITERIA & RUBRIC BUILDER
1. **VERBS**: Identify the cognitive verbs in the vault's SLOs (e.g., "Analyze", "Calculate").
2. **SCALING**: Create a 4-level rubric (Exceptional, Proficient, Developing, Beginning).
3. **PRECISION**: Use observable behaviors in the descriptors.
4. **REFERENCE**: Explicitly link the 'Proficient' column to the verbatim curriculum standard.
`;
    case 'learning-path':
      return `
### 🛠️ TOOL: SEQUENTIAL LEARNING PATHWAY
1. **PREREQUISITES**: Identify earlier units/SLOs in the vault that must be taught first.
2. **FLOW**: Create a 3-step sequence: [Foundation] -> [Active Lesson] -> [Extension].
3. **GAPS**: If the vault is missing a prerequisite, explicitly state "External Knowledge Required: [Concept]".
`;
    case 'slo-tagger':
      return `
### 🛠️ TOOL: METADATA EXTRACTION & TAGGING
1. **AUDIT**: Scan the user input and find matches in the <AUTHORITATIVE_VAULT>.
2. **OUTPUT**: Return a JSON-style list of [Matched SLO Code] | [Confidence Score] | [Topic Alignment].
`;
    default:
      return "\nProceed with pedagogical synthesis anchored to the provided curriculum assets.";
  }
}

function getWordCount(length: 'short' | 'medium' | 'long'): string {
  return { short: '50-150', medium: '200-500', long: '800-1500' }[length];
}

function getLookupInstructions(slo?: string): string {
  return `
📋 RESPONSE INSTRUCTIONS FOR SLO LOOKUP:
FORMAT: Definition + Brief Pedagogical Application.
CRITICAL: Use verbatim quote from vault.
`;
}

function getTeachingInstructions(slo?: string): string {
  return `
🎓 RESPONSE INSTRUCTIONS FOR TEACHING STRATEGIES:
FORMAT: 3-5 specific, actionable teaching strategies with time allocations.
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
🎭 RESPONSE INSTRUCTIONS FOR DIFFERENTIATION STRATEGIES:
Provide Support (Tier 1), At-Level (Tier 2), and Extension (Tier 3) strategies specifically for the selected curriculum asset.
`;
}

function getGeneralInstructions(): string {
  return `
💬 RESPONSE INSTRUCTIONS FOR GENERAL QUERY:
Provide a helpful, focused response addressing the specific question using documents when relevant.
`;
}
