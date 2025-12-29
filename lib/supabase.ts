
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
    // 1. Check Auth Connectivity
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) return { status: 'error', message: `Auth Error: ${authError.message}` };

    // 2. Check Tables Existence & RLS
    const { error: profileError } = await supabase.from('profiles').select('id').limit(1);
    
    if (profileError) {
      if (profileError.code === '42P01') return { status: 'error', message: 'Database tables missing. Run the V8 SQL Patch.' };
      if (profileError.code === 'PGRST301') return { status: 'rls_locked', message: 'API Key permissions blocked by RLS.' };
      return { status: 'configured', message: `Database error: ${profileError.message}` };
    }

    // 3. Check Documents Table specifically
    const { error: docError } = await supabase.from('documents').select('id').limit(1);
    if (docError && docError.code === '42P01') {
      return { status: 'error', message: 'Table "documents" missing. Run SQL in Supabase Editor.' };
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

export const uploadFile = async (file: File, bucket: string = 'documents') => {
  if (!isSupabaseConfigured) return null;
  
  const fileExt = file.name.split('.').pop();
  const fileName = `${crypto.randomUUID()}.${fileExt}`;

  try {
    const { data, error } = await supabase.storage.from(bucket).upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });
    
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
    return publicUrl;
  } catch (err) {
    console.error("Storage upload failed:", err);
    return null;
  }
};
