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

async function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new TimeoutError(errorMessage)), ms);
  });
  return Promise.race([promise, timeout]);
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries === 0 || error instanceof Error && error.message.includes('Auth')) throw error;
    console.warn(`Attempt failed. Retrying in ${delay}ms...`, error);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(operation, retries - 1, delay * 2);
  }
}

export async function uploadDocument(
  file: File,
  userId: string,
  onProgress: UploadProgress
): Promise<UploadResult> {
  onProgress(5, 'Authenticating node...');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication expired. Please log in again.');

  onProgress(10, 'Validating curriculum payload...');
  if (file.size > 10 * 1024 * 1024) throw new Error('Maximum node size is 10MB.');
  const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/jpeg', 'image/png'];
  if (!allowed.includes(file.type)) throw new Error('Unsupported format. Please use PDF, DOCX, TXT or PNG/JPG.');

  onProgress(15, 'Verifying cloud storage bucket...');
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some(b => b.name === 'documents')) {
    throw new Error('Infrastructure error: Storage bucket "documents" not found. Run SQL Initialization.');
  }

  onProgress(20, 'Opening secure channel...');
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${userId}/${timestamp}_${sanitizedName}`;

  const performStorageUpload = async () => {
    onProgress(30, 'Streaming to cloud library...');
    const uploadPromise = supabase.storage
      .from('documents')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    const { data, error } = (await withTimeout(uploadPromise, STORAGE_TIMEOUT, 'Storage channel timed out. Please check your network.')) as any;
    if (error) throw error;
    onProgress(70, 'Stream finalized.');
    return data;
  };

  await retryWithBackoff(performStorageUpload);

  onProgress(80, 'Verifying node persistence...');

  const performDbRegistry = async () => {
    onProgress(90, 'Updating curriculum manifest...');
    const insertPromise = supabase
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

    const { data, error } = (await withTimeout(insertPromise, DB_TIMEOUT, 'Database sync failed. Retrying...')) as any;
    if (error) {
      // Rollback storage if DB fails
      await supabase.storage.from('documents').remove([filePath]);
      throw error;
    }
    return data;
  };

  const dbRecord = await retryWithBackoff(performDbRegistry);

  onProgress(100, 'Handshake complete.');

  return {
    id: dbRecord.id,
    name: dbRecord.name,
    filePath: dbRecord.file_path,
    mimeType: dbRecord.mime_type
  };
}
