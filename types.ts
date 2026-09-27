// FIXED: types.ts — Pedagogy Master AI
export enum UserRole {
  TEACHER = 'teacher',
  ENTERPRISE_ADMIN = 'enterprise_admin',
  APP_ADMIN = 'app_admin'
}

export enum StakeholderRole {
  GOVT_AUDITOR = 'auditor_govt',
  NGO_OBSERVER = 'observer_ngo',
  INST_LEAD = 'admin_inst'
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
  stakeholderRole?: StakeholderRole;
  plan: SubscriptionPlan;
  queriesUsed: number;
  queriesLimit: number;
  name: string;
  workspaceId?: string;
  workspaceName?: string;
  workspaceLogo?: string;
  generationCount: number;
  successRate: number;
  onboarding_completed?: boolean;
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

export interface NeuralBrain {
  id: string;
  masterPrompt: string;
  blueprintSql?: string;
  bloomRules: string;
  version: number;
  isActive: boolean;
  updatedAt: string;
}

export enum IngestionStep {
  EXTRACT = 'EXTRACT',
  LINEARIZE = 'LINEARIZE',
  ENRICH = 'ENRICH',
  EMBED = 'EMBED',
  COMPLETE = 'COMPLETE'
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  FAILED = 'failed'
}

export interface IngestionJob {
  id: string;
  documentId: string;
  step: IngestionStep;
  status: JobStatus;
  retryCount: number;
  errorMessage?: string;
  payload?: any;
  updatedAt: string;
}

export interface Document {
  id: string;
  userId: string;
  workspaceId?: string;
  name: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  sourceType: 'markdown' | 'pdf_archival';
  isApproved: boolean;
  curriculumName: string;
  authority: string;
  subject: string;
  gradeLevel: string;
  versionYear: string;
  generatedJson?: any;
  version: number;
  filePath?: string;
  mimeType?: string;
  extractedText?: string;
  createdAt: string;
  chunkCount?: number;
  isPublic?: boolean;
  documentSummary?: string;
  difficultyLevel?: string;
  errorMessage?: string;
  geminiProcessed?: boolean;
  isSelected?: boolean;
  base64Data?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

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

export interface SLO {
  code: string;
  description: string;
  fullText?: string;
  bloomLevel?: string;
  grade?: string;
}

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

export type ActivityCategory = 
  | 'document_upload' 
  | 'query_completion' 
  | 'setting_adjustment' 
  | 'system_event';

export type ActivityStatus = 'success' | 'processing' | 'failed';

export interface ActivityLog {
  id: string;
  userId?: string;
  category: ActivityCategory;
  action: string;
  summary: string;
  status: ActivityStatus;
  timestamp: string;
  durationMs?: number;
  metadata?: {
    documentId?: string;
    documentName?: string;
    board?: string;
    subject?: string;
    fileSize?: number;
    mimeType?: string;
    slosExtracted?: number;
    promptPreview?: string;
    model?: string;
    tokensUsed?: number;
    toolName?: string;
    settingKey?: string;
    previousValue?: any;
    newValue?: any;
    errorMessage?: string;
    [key: string]: any;
  };
}
