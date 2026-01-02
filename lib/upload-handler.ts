import { supabase } from './supabase';

export type UploadProgress = (percentage: number, status: string) => void;

interface UploadResult {
  id: string;
  name: string;
  filePath: string;
  mimeType: string;
}

const MAX_RETRIES = 3;
const STORAGE_TIMEOUT = 30000; // 30s
const DB_TIMEOUT = 15000;      // 15s

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wraps a promise with a timeout.
 */
async function withTimeout<T>(
  promise: Promise<T> | PromiseLike<T>, 
  ms: number, 
  errorMessage: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new TimeoutError(errorMessage)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]);
}

/**
 * Generic retry logic with exponential backoff.
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries === 0 || (error instanceof Error && error.message.includes('Auth'))) throw error;
    console.warn(`Retry attempt left: ${retries}. Delaying ${delay}ms...`, error);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(operation, retries - 1, delay * 2);
  }
}

/**
 * Main upload handler strictly using Supabase Storage.
 */
export async function uploadDocument(
  file: File,
  userId: string,
  onProgress: UploadProgress
): Promise<UploadResult> {
  // Stage 1: Auth check (5%)
  onProgress(5, 'Authenticating session...');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error('Please sign in to upload.');
  }

  // Stage 2: Validation (10%)
  onProgress(10, 'Validating curriculum file...');
  if (file.size > 10 * 1024 * 1024) throw new Error('Max 10MB allowed.');
  
  const allowed = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png'
  ];
  if (!allowed.includes(file.type)) {
    throw new Error('Unsupported format. Use PDF, DOCX, TXT or PNG/JPG.');
  }

  // Stage 3: Prepare (20%)
  onProgress(20, 'Preparing secure channel...');
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${userId}/${timestamp}_${sanitizedName}`;

  // Stage 4: Storage Upload (30% - 70%)
  const performStorageUpload = async () => {
    onProgress(40, 'Uploading to storage...');
    
    // Note: Standard Supabase upload doesn't provide fine-grained progress without additional setup,
    // so we use staged updates here.
    const { data, error } = (await withTimeout(
      supabase.storage.from('documents').upload(filePath, file, { 
        cacheControl: '3600', 
        upsert: false 
      }),
      STORAGE_TIMEOUT,
      'Upload timeout. Retrying...'
    )) as any;
    
    if (error) throw error;
    onProgress(70, 'Upload complete.');
    return data;
  };

  await retryWithBackoff(performStorageUpload);

  // Stage 5: Database Registry (80% - 90%)
  const performDbRegistry = async () => {
    onProgress(85, 'Saving metadata...');
    
    const { data, error } = (await withTimeout(
      supabase.from('documents').insert({
        user_id: userId,
        name: file.name,
        file_path: filePath,
        mime_type: file.type,
        status: 'ready',
        created_at: new Date().toISOString()
      }).select().single(),
      DB_TIMEOUT,
      'Failed to save metadata. Retrying...'
    )) as any;
    
    if (error) {
      // Rollback storage if DB fails
      await supabase.storage.from('documents').remove([filePath]);
      throw error;
    }
    return data;
  };

  const dbRecord = await retryWithBackoff(performDbRegistry);

  // Stage 6: Success (100%)
  onProgress(100, 'Handshake success!');

  return {
    id: dbRecord.id,
    name: dbRecord.name,
    filePath: dbRecord.file_path,
    mimeType: dbRecord.mime_type
  };
}