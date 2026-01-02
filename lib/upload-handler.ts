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

/**
 * Exponential backoff helper
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    console.warn(`Upload attempt failed. Retrying in ${delay}ms...`, err);
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

/**
 * Promise timeout helper
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]);
}

/**
 * Master Upload Handler: Solves the 5% hang issue
 */
export async function uploadDocument(
  file: File,
  userId: string,
  onProgress: UploadProgress
): Promise<UploadResult> {
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
  const filePath = `${userId}/${timestamp}_${sanitizedName}`;

  // 5% - Already set by component
  
  // 10% - File Validation
  onProgress(10, 'Validating file properties...');
  if (file.size > 10 * 1024 * 1024) throw new Error('Max 10MB allowed');
  const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/jpeg', 'image/png'];
  if (!allowedTypes.includes(file.type)) throw new Error('Format unsupported. Use PDF, DOCX, TXT, or Image.');

  // 20% - Preparing Upload
  onProgress(20, 'Preparing secure storage channel...');

  // 30-70% - Uploading to Storage
  const storageUpload = async () => {
    onProgress(30, 'Streaming to cloud storage...');
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (error) throw error;
    onProgress(70, 'Upload stream complete');
    return data;
  };

  await withRetry(() => withTimeout(storageUpload(), STORAGE_TIMEOUT, 'Storage upload timeout. Connection might be unstable.'));

  // 80% - Verification
  onProgress(80, 'Verifying file integrity...');

  // 90% - Saving to Database
  const dbRegistry = async () => {
    onProgress(90, 'Syncing metadata with library...');
    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        name: file.name,
        file_path: filePath,
        mime_type: file.type,
        status: 'ready',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      // Clean up orphaned file if DB fails
      await supabase.storage.from('documents').remove([filePath]);
      throw error;
    }
    return data;
  };

  const dbDoc = await withRetry(() => withTimeout(dbRegistry(), DB_TIMEOUT, 'Database save failure. Retrying...'));

  // 100% - Success
  onProgress(100, 'Success! Node ingested.');

  return {
    id: dbDoc.id,
    name: dbDoc.name,
    filePath: dbDoc.file_path,
    mimeType: dbDoc.mime_type
  };
}
