
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

/**
 * Student Learning Objective interface
 */
export interface SLO {
  id: string;
  code: string;
  description: string;
  level?: string;
  bloomLevel?: string;
  strategies?: string[];
  assessmentIdeas?: string[];
}

/**
 * Teacher curriculum coverage tracking
 */
export interface TeacherProgress {
  id: string;
  userId: string;
  sloCode: string;
  status: 'planning' | 'teaching' | 'completed';
  taughtDate?: string;
  studentMasteryPercentage?: number;
  notes?: string;
  createdAt: string;
}

/**
 * Output artifact interface for tracking AI generated content and feedback
 */
export interface OutputArtifact {
  id: string;
  userId: string;
  contentType: string;
  content: string;
  metadata: any;
  status: 'generated' | 'exported' | 'accepted' | 'abandoned' | 'edited';
  editDepth: number;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  plan: SubscriptionPlan;
  queriesUsed: number;
  queriesLimit: number;
  name: string;
  gradeLevel?: string;
  subjectArea?: string;
  activeDocId?: string;
  teachingStyle?: 'concise' | 'balanced' | 'comprehensive';
  pedagogicalApproach?: 'inquiry-based' | 'direct-instruction' | 'flipped-classroom';
  preferredFramework?: 'madeline_hunter' | '5e' | 'ubd' | 'none';
  boardCurriculum?: string;
  generationCount: number;
  successRate: number;
  editPatterns: {
    avgLengthChange: number;
    examplesCount: number;
    structureModifications: number;
  };
}

export interface Document {
  id: string;
  userId: string;
  name: string;
  base64Data?: string;
  filePath?: string;
  mimeType?: string;
  status: 'processing' | 'completed' | 'failed' | 'uploading' | 'ready';
  storageType?: 'r2' | 'supabase';
  isPublic?: boolean;
  isSelected?: boolean;
  subject: string;
  gradeLevel: string;
  extractedText?: string;
  sloTags: SLO[];
  createdAt: string;
  // Enhanced schema fields
  geminiProcessed?: boolean;
  documentSummary?: string;
  difficultyLevel?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  aiProvider?: string;
  documentIds?: string[];
  pedagogyScore?: number;
}

export interface NeuralBrain {
  id: string;
  masterPrompt: string;
  bloomRules: string;
  version: number;
  isActive: boolean;
  updatedAt: string;
}
