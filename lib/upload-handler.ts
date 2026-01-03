
import { supabase } from './supabase';
import { r2Client, R2_BUCKET, isR2Configured } from './r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export type UploadProgress = (percentage: number, status: string) => void;

interface UploadResult {
  id: string;
  name: string;
  filePath: string;
  mimeType: string;
  storage: 'r2' | 'supabase';
}

/**
 * Smart Upload Handler
 * Prioritizes R2 if configured, otherwise uses Supabase Storage.
 */
export async function uploadDocument(
  file: File,
  userId: string,
  onProgress: UploadProgress
): Promise<UploadResult> {
  onProgress(5, 'Handshaking with cloud nodes...');
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Auth session expired. Please sign in.');

  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${userId}/${timestamp}_${sanitizedName}`;

  // OPTION A: CLOUDFLARE R2
  if (isR2Configured() && r2Client) {
    onProgress(20, 'Routing to Cloudflare R2...');
    try {
      const buffer = await file.arrayBuffer();
      onProgress(40, 'Streaming bits to R2 bucket...');
      
      // Note: In a browser environment, we use a slightly different approach for the body
      // or we handle this via a server-side API to keep keys safe. 
      // Assuming server-side environment or secure proxy for this logic.
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: filePath,
          Body: new Uint8Array(buffer),
          ContentType: file.type,
        })
      );

      onProgress(80, 'Finalizing R2 metadata...');
      const { data, error } = await supabase.from('documents').insert({
        user_id: userId,
        name: file.name,
        file_path: filePath,
        mime_type: file.type,
        status: 'ready',
        storage_type: 'r2'
      }).select().single();

      if (error) throw error;
      onProgress(100, 'Cloudflare R2 Sync Complete!');
      
      return {
        id: data.id,
        name: data.name,
        filePath: data.file_path,
        mimeType: data.mime_type,
        storage: 'r2'
      };
    } catch (err: any) {
      console.error('R2 Fail, falling back:', err);
      onProgress(25, 'R2 Interrupted. Falling back to Supabase...');
    }
  }

  // OPTION B: SUPABASE STORAGE (Fallback)
  onProgress(30, 'Streaming to Supabase Storage...');
  const { error: storageError } = await supabase.storage
    .from('documents')
    .upload(filePath, file);

  if (storageError) throw storageError;

  onProgress(85, 'Registering Supabase metadata...');
  const { data: dbData, error: dbError } = await supabase.from('documents').insert({
    user_id: userId,
    name: file.name,
    file_path: filePath,
    mime_type: file.type,
    status: 'ready',
    storage_type: 'supabase'
  }).select().single();

  if (dbError) throw dbError;

  onProgress(100, 'Supabase Sync Complete!');
  return {
    id: dbData.id,
    name: dbData.name,
    filePath: dbData.file_path,
    mimeType: dbData.mime_type,
    storage: 'supabase'
  };
}
