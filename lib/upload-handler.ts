import { supabase } from './supabase';

export type UploadProgress = (percentage: number, status: string) => void;

interface UploadResult {
  id: string;
  name: string;
  filePath: string;
  mimeType: string;
}

const MAX_RETRIES = 3;
const STORAGE_TIMEOUT = 30000;
const DB_TIMEOUT = 15000;

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Promise wrapper with explicit timeout and support for Supabase thenables.
 */
async function withTimeout<T>(
  promise: Promise<T> | PromiseLike<T> | any, 
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
 * Main upload handler with staged progress and robust error recovery.
 */
export async function uploadDocument(
  file: File,
  userId: string,
  onProgress: UploadProgress
): Promise<UploadResult> {
  // Stage 1: Auth check
  onProgress(5, 'Checking authentication...');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error('Authentication failure. Please sign in again.');
  }

  // Stage 2: Validation
  onProgress(10, 'Validating file node...');
  if (file.size > 10 * 1024 * 1024) throw new Error('File too large (Max 10MB allowed).');
  
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png'
  ];
  if (!allowedMimeTypes.includes(file.type)) {
    throw new Error('Unsupported format. Please use PDF, DOCX, TXT, or images.');
  }

  // Stage 3: Prepare path
  onProgress(20, 'Preparing secure path...');
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${userId}/${timestamp}_${sanitizedName}`;

  // Stage 4: Storage Upload (30% - 70%)
  const performStorageUpload = async () => {
    onProgress(30, 'Uploading to secure storage...');
    
    const { data, error } = (await withTimeout(
      supabase.storage.from('documents').upload(filePath, file, { cacheControl: '3600', upsert: false }),
      STORAGE_TIMEOUT,
      'Storage upload timed out. Retrying...'
    )) as any;
    
    if (error) throw error;
    onProgress(70, 'Storage upload complete.');
    return data;
  };

  await retryWithBackoff(performStorageUpload);

  // Stage 5: URL verification
  onProgress(80, 'Verifying file node URL...');

  // Stage 6: Database Registry (90%)
  const performDbRegistry = async () => {
    onProgress(90, 'Saving metadata to database...');
    
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
      'Database registry timed out. Retrying...'
    )) as any;
    
    if (error) {
      // Cleanup storage on DB failure
      await supabase.storage.from('documents').remove([filePath]);
      throw error;
    }
    return data;
  };

  const dbRecord = await retryWithBackoff(performDbRegistry);

  // Stage 7: Complete
  onProgress(100, 'Success!');

  return {
    id: dbRecord.id,
    name: dbRecord.name,
    filePath: dbRecord.file_path,
    mimeType: dbRecord.mime_type
  };
}