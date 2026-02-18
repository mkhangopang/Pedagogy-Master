import { ToolType } from './tool-router';

const TOOL_EXPERT_PROMPTS: Record<ToolType, string> = {
  master_plan: `
EXPERT ROLE: INSTRUCTIONAL ARCHITECT
FRAMEWORK: 5E + UbD (Understanding by Design).
FOCUS: Scaffolded activities (Below/At/Above Grade Level), Engagement Hooks, and Modeling (I Do/We Do/You Do).
`,
  neural_quiz: `
EXPERT ROLE: ASSESSMENT SCIENTIST
FOCUS: Bloom's Taxonomy scaling, plausible distractors, and Neural Answer Keys (pedagogical explanations for every option).
`,
  fidelity_rubric: `
EXPERT ROLE: EVALUATION ENGINEER
FOCUS: 4-Point Analytic Rubrics with observable, measurable criteria. Output must be a Markdown Table.
`,
  audit_tagger: `
EXPERT ROLE: CURRICULUM AUDITOR
FOCUS: Webb's Depth of Knowledge (DOK 1-4). Perform a Gap Analysis between provided content and the SLO Vault.
`
};

const WORKFLOW_LOGIC = `
## WORKFLOW CONTINUITY
At the very end of your response, always provide a "Workflow Recommendation" based on the instructional cycle: Audit -> Plan -> Quiz -> Rubric.
FORMAT: --- Workflow Recommendation: [Tool_ID] | [Short Pedagogical Reason] ---
`;

export async function getFullPrompt(tool: ToolType, customInstructions: string, basePrompt: string): Promise<string> {
  // Logic: Combined dynamic identity from DB + specialized persona + workflow trigger
  return `
${basePrompt}
${TOOL_EXPERT_PROMPTS[tool] || 'EXPERT: PEDAGOGY GENERALIST'}
${WORKFLOW_LOGIC}
CONTEXT: ${customInstructions || 'Standard Operating Procedure'}
`;
}