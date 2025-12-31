
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = 
  supabaseUrl !== '' && 
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey !== '' &&
  supabaseAnonKey !== 'placeholder';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

export type ConnectionStatus = 'disconnected' | 'configured' | 'connected' | 'error' | 'rls_locked';

/**
 * Performs a deep health check of the database connection and schema
 */
export const getSupabaseHealth = async (): Promise<{ status: ConnectionStatus; message: string }> => {
  if (!isSupabaseConfigured) {
    return { status: 'disconnected', message: 'Environment variables are missing.' };
  }

  try {
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError) return { status: 'error', message: `Auth Error: ${authError.message}` };

    const { error: profileError } = await supabase.from('profiles').select('id').limit(1);
    
    if (profileError) {
      if (profileError.code === '42P01') return { status: 'error', message: 'Database tables missing. Run SQL Patch v38.' };
      if (profileError.code === 'PGRST301') return { status: 'rls_locked', message: 'API Key permissions blocked by RLS.' };
      return { status: 'configured', message: `Database error: ${profileError.message}` };
    }

    return { status: 'connected', message: 'Full cloud sync active.' };
  } catch (err) {
    return { status: 'error', message: 'Network failure or Supabase unreachable.' };
  }
};

/**
 * Verifies if the current user can actually write to the database
 */
export const verifyPersistence = async (userId: string): Promise<boolean> => {
  try {
    const { error } = await supabase.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', userId);
    return !error;
  } catch {
    return false;
  }
};

/**
 * Uploads a file to Supabase storage.
 * Updated: Passes the File object directly to use native stream handling.
 */
export const uploadFile = async (file: File, bucket: string = 'documents'): Promise<{ publicUrl: string, path: string }> => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase project is not configured.');
  }
  
  const fileExt = file.name.split('.').pop();
  const fileName = `${crypto.randomUUID()}.${fileExt}`;

  // Using the File object directly is safer for memory and timeouts
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    });
  
  if (error) {
    console.error("Storage Logic Error:", error);
    if (error.message.includes('row level security')) {
      throw new Error('Access Denied: RLS is blocking the transfer. Apply SQL Patch v38.');
    }
    throw new Error(`Cloud Rejection: ${error.message}`);
  }
  
  if (!data?.path) {
    throw new Error('Transfer succeeded but path registration failed.');
  }

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return { publicUrl, path: data.path };
};
