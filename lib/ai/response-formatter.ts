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
    case 'master_plan':
      return `
### 🛠️ TOOL: MASTER LESSON SYNTHESIZER (INSTITUTIONAL v5.0)
1. **SUBJECT-SPECIFIC RIGOR**:
   - For Mathematics: Execute Singapore Math CPA (Concrete-Pictorial-Abstract) with named physical manipulatives, explicit visual sketching conventions, and strict LaTeX formulas ($...$ inline, $$...$$ block).
   - For Sciences: Execute 5E Inquiry / Phenomenon-Based Learning with empirical variable control and Claim-Evidence-Reasoning (CER) synthesis.
   - For Languages/Humanities: Execute Gradual Release of Responsibility (GRR), mentor text analysis, and Tier 2/3 academic vocabulary routines.
2. **MANDATORY INSTITUTIONAL SECTIONS**:
   - 1. METADATA & PEDAGOGICAL SPECIFICATIONS (Standard, Grade, Subject/Domain, Pacing, Key Manipulatives)
   - 2. STANDARDS ALIGNMENT & COGNITIVE RIGOR (SLO Code, Bloom's Level, DOK Level, Vertical Alignment)
   - 3. DUAL-TRACK OBJECTIVES & ACADEMIC LANGUAGE (Content Objective, Language Objective with sentence frames, Core Lexicon)
   - 4. DETAILED TIMED PROGRESSION WITH VERBATIM SCRIPTS (Hook, "I Do" with Teacher Scripts \`> **Teacher Script:** "..."\`, "We Do" with paired talk routines, Hinge CFU with distractor analysis, "You Do" practice, Closure)
   - 5. COMMON MISCONCEPTIONS & CORRECTION PROTOCOLS (Table: Misconception | Visible Behavior | Cognitive Root Cause | Teacher Pivot)
   - 6. 3-TIER DIFFERENTIATION MATRIX (Table: Below Grade / Tier 1, At Grade / Tier 2, Above Grade / Tier 3)
   - 7. FORMATIVE EXIT TICKET & EVALUATION RUBRIC (3-question Exit Ticket with Answer Key + 3-level Rubric)
`;
    case 'slo-tagger':
    case 'audit_tagger':
      return `
### 🛠️ TOOL: NEURAL SLO AUDITOR
1. **DEEP AUDIT**: Scan the input for specific SLO matches in the vault.
2. **CONTEXTUAL INFERENCE**: Assign Bloom's level and Webb's DOK based on the entire standard clause.
3. **OUTPUT**: [CODE] | [BLOOM LEVEL] | [DOK] | [VERBATIM DESCRIPTION] | [PREREQUISITE DEPENDENCY].
`;
    default:
      return "\nProceed with institutional pedagogical synthesis.";
  }
}

function getLookupInstructions(): string {
  return `\nFORMAT: Definition + Brief Pedagogical Application. Use verbatim quote from vault if found. Include exact standard code and domain reference.`;
}

function getTeachingInstructions(): string {
  return `\nFORMAT: 3-5 high-leverage teaching strategies with specific time allocations, manipulatives/resources, explicit teacher scripts, and anticipated student misconceptions.`;
}

function getLessonPlanInstructions(): string {
  return getToolSpecificInstructions('master_plan');
}