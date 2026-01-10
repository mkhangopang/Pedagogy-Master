
export interface AssessmentOptions {
  type: 'formative' | 'summative';
  format: 'MCQ' | 'Short Answer' | 'Essay' | 'Mixed' | 'CRQ';
  questionCount: number;
  bloomLevels: string[];
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Mixed';
  standards?: string[]; 
}

export interface Question {
  id: string;
  type: string;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  points: number;
  bloomLevel: string;
  difficulty: string;
  rubricCriteria?: string[]; // Added for CRQ/Short Answer
}

export interface Assessment {
  title: string;
  instructions: string;
  questions: Question[];
  totalPoints: number;
  estimatedTime: number;
}

export function buildAssessmentPrompt(
  lessonContent: string,
  options: AssessmentOptions
): string {
  
  const crqInstruction = options.format === 'CRQ' ? 
    "Focus on CONSTRUCTED RESPONSE QUESTIONS (CRQ). These should require students to synthesize information from the text and provide evidence-based answers. Each question must include a sample 'Full Credit' response and scoring criteria." : "";

  return `
Generate a ${options.type} assessment based on this lesson:

${lessonContent}

REQUIREMENTS:
- Format: ${options.format}
- Number of questions: ${options.questionCount}
- Bloom's levels to target: ${options.bloomLevels.join(', ')}
- Difficulty: ${options.difficulty}
${options.standards ? `- Must align with standards: ${options.standards.join(', ')}` : ''}
${crqInstruction}

For each question, provide:
1. Question text
2. Answer options (only for MCQ)
3. Correct answer (or 'Ideal Response' for CRQ)
4. Explanation / Scoring Guide
5. Bloom's level
6. Points value

OUTPUT FORMAT:
Produce a single JSON object. Do not include conversational text.
{
  "title": "Title",
  "instructions": "Instructions",
  "questions": [
    {
      "id": "q1",
      "type": "${options.format === 'Mixed' ? 'MCQ' : options.format}",
      "question": "...",
      "options": ["A) ...", "B) ..."],
      "correctAnswer": "...",
      "explanation": "...",
      "points": 1,
      "bloomLevel": "...",
      "difficulty": "...",
      "rubricCriteria": ["Point 1...", "Point 2..."]
    }
  ]
}
`;
}
