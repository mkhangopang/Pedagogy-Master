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
      if (profileError.code === '42P01') return { status: 'error', message: 'Database tables missing. Run SQL Patch v57.' };
      return { status: 'configured', message: `Database error: ${profileError.message}` };
    }

    return { status: 'connected', message: 'Full cloud sync active.' };
  } catch (err) {
    return { status: 'error', message: 'Network failure or Supabase unreachable.' };
  }
};

/**
 * Robust upload to private bucket with RLS support.
 * Path MUST be {user_id}/{filename} for v55+ policies.
 */
export async function uploadToPrivateBucket(
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<{ path: string; url: string }> {
  
  try {
    // Step 1: Authentication (10%)
    // USE getSession: it's localized and faster than getUser, fixing the 10% hang.
    onProgress?.(10, 'Validating local session...');
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError || !session?.user) {
       // Fallback to getUser if session is missing but we're trying to upload
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) throw new Error('Session expired. Please sign in again.');
    }
    
    const userId = session?.user?.id || (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('Authorization required.');

    // Step 2: Validate file (20%)
    onProgress?.(20, 'Verifying file integrity...');
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (file.size > maxSize) throw new Error('Curriculum file too large (Max 25MB).');

    // Step 3: Prepare path (30%)
    onProgress?.(30, 'Preparing secure tunnel...');
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${userId}/${timestamp}_${sanitizedName}`;

    // Step 4: Transmit (40-80%)
    onProgress?.(40, 'Transmitting to cloud cluster...');
    const uploadPromise = supabase.storage
      .from('documents')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Storage transmission timed out (45s)')), 45000)
    );

    const { data, error } = await Promise.race([uploadPromise, timeoutPromise]) as any;

    if (error) throw new Error(`Cloud Rejection: ${error.message}`);

    // Step 5: Finalize link (90%)
    onProgress?.(90, 'Generating link...');
    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

    return { path: filePath, url: publicUrl };

  } catch (err: any) {
    console.error('Ingestion Core Error:', err);
    throw err;
  }
}

/**
 * Legacy wrapper for compatibility.
 */
export const uploadFile = async (file: File, userId: string) => {
  const result = await uploadToPrivateBucket(file);
  return { publicUrl: result.url, path: result.path };
};