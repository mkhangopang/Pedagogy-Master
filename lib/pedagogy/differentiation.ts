
import { DIFFERENTIATION_STRATEGIES } from './frameworks';

export interface DifferentiatedLesson {
  level: 'below' | 'at' | 'above';
  objective: string;
  materials: string[];
  activities: string[];
  assessment: string;
  supports: string[];
}

export function buildDifferentiationPrompt(
  baseLessonPlan: string,
  targetLevel: 'below' | 'at' | 'above'
): string {
  
  const strategies = {
    content: DIFFERENTIATION_STRATEGIES.content[targetLevel as keyof typeof DIFFERENTIATION_STRATEGIES.content] || [],
    process: [], // Could extend frameworks.ts to include these
    product: []  // Could extend frameworks.ts to include these
  };

  return `
Base Lesson Plan:
${baseLessonPlan}

Create a differentiated version for **${targetLevel.toUpperCase()} GRADE LEVEL** students.

PEDAGOGICAL STRATEGY:
${strategies.content.map(s => `- ${s}`).join('\n')}

${targetLevel === 'below' ? `
CRITICAL for struggling learners:
- Break instructions into small steps
- Provide sentence starters/frames
- Allow extra time
- Use more visuals and manipulatives
` : ''}

${targetLevel === 'above' ? `
CRITICAL for advanced learners:
- Add complexity and depth
- Encourage critical thinking
- Provide leadership opportunities
- Connect to real-world applications
` : ''}

Format the response clearly with these sections:
**Objective:** [Modified objective]
**Materials:** [List with -]
**Activities:** [Step-by-step, differentiated with -]
**Assessment:** [How you'll measure learning]
**Supports:** [Scaffolds or extensions with -]
`;
}

export function parseDifferentiatedResponse(response: string, level: 'below' | 'at' | 'above'): DifferentiatedLesson {
  const extractSection = (text: string, section: string): string => {
    const regex = new RegExp(`\\*\\*${section}:\\*\\*\\s*(.+?)(?=\\*\\*|$)`, 's');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  };

  const extractList = (text: string, section: string): string[] => {
    const content = extractSection(text, section);
    return content.split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim());
  };

  return {
    level,
    objective: extractSection(response, 'Objective'),
    materials: extractList(response, 'Materials'),
    activities: extractList(response, 'Activities'),
    assessment: extractSection(response, 'Assessment'),
    supports: extractList(response, 'Supports')
  };
}
