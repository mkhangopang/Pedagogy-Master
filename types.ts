
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
  organizationId?: string;
  name: string;
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
  content?: string; // Content becomes optional as we use File API
  geminiFileUri?: string;
  mimeType?: string;
  fileUrl?: string;
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

export interface ToolGenerationRequest {
  toolType: 'lesson-plan' | 'assessment' | 'rubric' | 'slo-tagger';
  context: string;
  documentContent?: string;
}
