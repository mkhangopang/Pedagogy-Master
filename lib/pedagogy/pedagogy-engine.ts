
import { BLOOM_TAXONOMY } from './frameworks';

export interface LessonValidation {
  isValid: boolean;
  score: number;
  bloomLevel: string;
  missingComponents: string[];
  suggestions: string[];
  strengths: string[];
}

export function validateLessonStructure(lessonPlan: string): LessonValidation {
  const lowerText = lessonPlan.toLowerCase();
  const missingComponents: string[] = [];
  const suggestions: string[] = [];
  const strengths: string[] = [];
  let score = 0;

  const checks = [
    { id: 'Objective', regex: /objective|learning goal|swbat|aim/i, weight: 25 },
    { id: 'Anticipatory Set', regex: /hook|anticipatory|warm-up|engage|starter/i, weight: 15 },
    { id: 'Differentiation', regex: /differentiat|scaffold|support|extension|tier|level/i, weight: 20 },
    { id: 'Assessment', regex: /assessment|evaluate|check.*understanding|exit.*ticket|quiz/i, weight: 20 },
    { id: 'Closure', regex: /closure|summary|review|wrap-up/i, weight: 20 }
  ];

  checks.forEach(check => {
    if (check.regex.test(lowerText)) {
      score += check.weight;
      strengths.push(`${check.id} identified.`);
    } else {
      missingComponents.push(check.id);
      suggestions.push(`Integrate a clear ${check.id} section.`);
    }
  });

  let bloomLevel = 'Remember';
  let highestLevel = 0;
  BLOOM_TAXONOMY.levels.forEach((level, index) => {
    const verbsFound = level.verbs.some(verb => new RegExp(`\\b${verb}\\b`, 'i').test(lowerText));
    if (verbsFound && index > highestLevel) {
      highestLevel = index;
      bloomLevel = level.level;
    }
  });

  return {
    isValid: score >= 60,
    score,
    bloomLevel,
    missingComponents,
    suggestions,
    strengths
  };
}

export function buildEnhancementPrompt(lessonPlan: string, framework: string): string {
  return `Enhance the following lesson plan using the ${framework} framework. 
  Ensure all specific phases are clearly labeled and logically connected.
  
  Original Plan:
  ${lessonPlan}`;
}
