
export enum UserRole {
  TEACHER = 'teacher',
  ENTERPRISE_ADMIN = 'enterprise_admin',
  APP_ADMIN = 'app_admin'
}

export enum SubscriptionPlan {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise'
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  plan: SubscriptionPlan;
  queriesUsed: number;
  queriesLimit: number;
  name: string;
  // Adaptive Learning Fields
  gradeLevel?: string;
  subjectArea?: string;
  teachingStyle?: 'concise' | 'balanced' | 'comprehensive';
  pedagogicalApproach?: 'inquiry-based' | 'direct-instruction' | 'flipped-classroom';
  // Behavioral Stats
  generationCount: number;
  successRate: number;
  editPatterns: {
    avgLengthChange: number;
    examplesCount: number;
    structureModifications: number;
  };
}

export interface OutputArtifact {
  id: string;
  userId: string;
  contentType: string;
  content: string;
  metadata: any;
  status: 'generated' | 'accepted' | 'edited' | 'exported' | 'abandoned';
  editDepth: number;
  createdAt: string;
}

export interface SLO {
  id: string;
  content: string;
  bloomLevel: string;
  cognitiveComplexity: number;
  keywords: string[];
  suggestedAssessment: string;
}

export interface Document {
  id: string;
  userId: string;
  name: string;
  base64Data?: string;
  filePath?: string;
  mimeType?: string;
  status: 'processing' | 'completed' | 'failed';
  subject: string;
  gradeLevel: string;
  sloTags: SLO[];
  createdAt: string;
}

export interface NeuralBrain {
  id: string;
  masterPrompt: string;
  bloomRules: string;
  version: number;
  isActive: boolean;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  documentId?: string;
}
