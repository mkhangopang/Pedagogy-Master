
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

export interface SLO {
  id: string;
  code: string;
  description: string;
  level?: string;
  bloomLevel?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  plan: SubscriptionPlan;
  queriesUsed: number;
  queriesLimit: number;
  name: string;
  generationCount: number;
  successRate: number;
  // Added fields for adaptive learning and profile management
  gradeLevel?: string;
  subjectArea?: string;
  teachingStyle?: string;
  pedagogicalApproach?: string;
  editPatterns?: {
    avgLengthChange: number;
    examplesCount: number;
    structureModifications: number;
  };
}

export interface Document {
  id: string;
  userId: string;
  name: string;
  status: 'draft' | 'validating' | 'ready' | 'failed' | 'processing' | 'completed';
  sourceType: 'markdown' | 'pdf_archival';
  isApproved: boolean;
  
  // Institutional Metadata
  curriculumName: string;
  authority: string; // e.g., Sindh, FBISE
  subject: string;
  gradeLevel: string;
  versionYear: string;
  
  // System Generated
  generatedJson?: any;
  version: number;
  
  filePath?: string;
  mimeType?: string;
  extractedText?: string;
  createdAt: string;
  chunkCount?: number;

  // Added fields for UI state and metadata
  sloTags?: any[];
  storageType?: 'r2' | 'supabase';
  isPublic?: boolean;
  documentSummary?: string;
  difficultyLevel?: string;
  geminiProcessed?: boolean;
  isSelected?: boolean;
  base64Data?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  groundingNodes?: string[];
}

/**
 * Neural brain configuration for system-wide logic prompts.
 */
export interface NeuralBrain {
  id: string;
  masterPrompt: string;
  bloomRules: string;
  version: number;
  isActive: boolean;
  updatedAt: string;
}

/**
 * Output artifacts representing generated content with feedback metadata.
 */
export interface OutputArtifact {
  id: string;
  userId: string;
  contentType: string;
  content: string;
  metadata: any;
  status: string;
  editDepth: number;
  createdAt: string;
}

/**
 * Progress tracking for curriculum objectives.
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
