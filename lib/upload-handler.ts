import { supabase } from './supabase';

export type UploadProgress = (percentage: number, status: string) => void;

interface UploadResult {
  id: string;
  name: string;
  filePath: string;
  mimeType: string;
}

const MAX_RETRIES = 3;
const STORAGE_TIMEOUT = 45000; // Increased to 45s for larger files/slower networks
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
 * Resolves the 5% hang by using explicit stages and reliable auth detection.
 */
export async function uploadDocument(
  file: File,
  userId: string,
  onProgress: UploadProgress
): Promise<UploadResult> {
  // Stage 1: Auth check (5% - 15%)
  onProgress(5, 'Authenticating cloud session...');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session) {
    throw new Error('Authentication failure. Please refresh and sign in again.');
  }
  onProgress(15, 'Handshake established.');

  // Stage 2: Validation (20%)
  onProgress(20, 'Validating file node...');
  if (file.size > 10 * 1024 * 1024) throw new Error('File size limit exceeded (Max 10MB).');
  
  const allowed = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png'
  ];
  if (!allowed.includes(file.type)) {
    throw new Error('Unsupported format. Please upload PDF, Word, or Image files.');
  }

  // Stage 3: Prepare path (25%)
  onProgress(25, 'Preparing secure storage path...');
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${userId}/${timestamp}_${sanitizedName}`;

  // Stage 4: Storage Upload (30% - 80%)
  const performStorageUpload = async () => {
    onProgress(35, 'Streaming to cloud bucket...');
    
    // Staged progress simulation since Supabase SDK upload progress is not yet fine-grained in standard client
    // Fix: Introduced local progress tracker variable to correctly pass a number to the onProgress callback
    let currentProgress = 35;
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 5, 75);
      onProgress(currentProgress, 'Streaming data chunks...');
    }, 1500);

    try {
      const { data, error } = (await withTimeout(
        supabase.storage.from('documents').upload(filePath, file, { 
          cacheControl: '3600', 
          upsert: false 
        }),
        STORAGE_TIMEOUT,
        'Storage connection timed out. Retrying node synchronization...'
      )) as any;
      
      clearInterval(progressInterval);
      if (error) throw error;
      
      onProgress(80, 'Node synchronized successfully.');
      return data;
    } catch (err) {
      clearInterval(progressInterval);
      throw err;
    }
  };

  await retryWithBackoff(performStorageUpload);

  // Stage 5: Database Registry (85% - 95%)
  const performDbRegistry = async () => {
    onProgress(85, 'Registering metadata node...');
    
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
      'Metadata registry timed out. Finalizing background sync...'
    )) as any;
    
    if (error) {
      // Rollback storage if DB fails to maintain consistency
      await supabase.storage.from('documents').remove([filePath]);
      throw error;
    }
    return data;
  };

  const dbRecord = await retryWithBackoff(performDbRegistry);

  // Stage 6: Success (100%)
  onProgress(100, 'Handshake complete! Node active.');

  return {
    id: dbRecord.id,
    name: dbRecord.name,
    filePath: dbRecord.file_path,
    mimeType: dbRecord.mime_type
  };
}
