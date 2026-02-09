
export enum UserRole {
  TEACHER = 'teacher',
  ENTERPRISE_ADMIN = 'enterprise_admin', // Used for School Chain Managers
  APP_ADMIN = 'app_admin'
}

export enum StakeholderRole {
  GOVT_AUDITOR = 'auditor_govt',
  NGO_OBSERVER = 'observer_ngo',
  INST_LEAD = 'admin_inst' // The Principal/Head of Academics for a chain
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
  workspaceId?: string; // Links teachers to a specific school chain
  workspaceName?: string;
  workspaceLogo?: string;
  generationCount: number;
  successRate: number;
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
  workspaceId?: string; // If set, this doc is "Global" for that school chain
  name: string;
  status: 'draft' | 'validating' | 'ready' | 'failed' | 'processing' | 'completed' | 'indexing';
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

export interface NeuralBrain {
  id: string;
  masterPrompt: string;
  bloomRules: string;
  version: number;
  isActive: boolean;
  updatedAt: string;
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
