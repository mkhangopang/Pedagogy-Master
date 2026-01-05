import { SLO } from '../../../../types';

/**
 * DOCUMENT METADATA INTERFACE (Supabase Table Schema)
 */
export interface DocumentMetadata {
  id: string;          // UUID
  user_id: string;     // Auth UID
  name: string;        // Original Filename
  file_path: string;   // Cloudflare R2 Key (e.g. {user_id}/{timestamp}_{name})
  mime_type: string;
  status: 'uploading' | 'ready' | 'failed';
  subject: string;
  grade_level: string;
  slo_tags: SLO[];
  created_at: string;
}

export type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'completing' | 'error';