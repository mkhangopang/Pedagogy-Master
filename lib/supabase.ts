
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseConfigured = 
  supabaseUrl !== '' && 
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey !== '' &&
  supabaseAnonKey !== 'placeholder';

// Standard client for browser-side RLS-bound operations
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

/**
 * Creates a privileged client for server-side routes only.
 * This bypasses RLS and is used to solve the 90% hang issue.
 */
export const createPrivilegedClient = () => {
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

export type ConnectionStatus = 'disconnected' | 'configured' | 'connected' | 'error' | 'rls_locked';

export const getSupabaseHealth = async (): Promise<{ status: ConnectionStatus; message: string }> => {
  if (!isSupabaseConfigured) {
    return { status: 'disconnected', message: 'Environment variables are missing.' };
  }

  try {
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError) return { status: 'error', message: `Auth Error: ${authError.message}` };

    const { error: profileError } = await supabase.from('profiles').select('id').limit(1);
    
    if (profileError) {
      if (profileError.code === '42P01') return { status: 'error', message: 'Database tables missing. Run SQL Patch v52.' };
      return { status: 'configured', message: `Database error: ${profileError.message}` };
    }

    return { status: 'connected', message: 'Full cloud sync active.' };
  } catch (err) {
    return { status: 'error', message: 'Network failure or Supabase unreachable.' };
  }
};

/**
 * Robust file upload with progress tracking and folder-based RLS support.
 * Enforces {userId}/{filename} path required for private bucket policies.
 */
export const uploadFile = async (
  file: File, 
  userId: string,
  bucket: string = 'documents'
): Promise<{ publicUrl: string, path: string }> => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase project is not configured.');
  }
  
  const fileExt = file.name.split('.').pop();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${Date.now()}_${sanitizedName}`;
  
  // CRITICAL: Path must be {user_id}/{filename} for RLS to work on private buckets
  const filePath = `${userId}/${fileName}`;

  // Upload with a race to handle potential hangs
  const uploadPromise = supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    });

  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Storage upload timeout after 30s')), 30000)
  );

  const { data, error } = await Promise.race([uploadPromise, timeoutPromise]) as any;
  
  if (error) {
    throw new Error(`Cloud Rejection: ${error.message}`);
  }
  
  if (!data?.path) {
    throw new Error('Transfer succeeded but path registration failed.');
  }

  // Get public URL (or create signed URL if needed, but the current policy allows public read if signed/authed)
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return { publicUrl, path: data.path };
};
