
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = 
  supabaseUrl !== '' && 
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey !== '' &&
  supabaseAnonKey !== 'placeholder';

// Provide a safe fallback to prevent crashes if env vars are missing
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

export type ConnectionStatus = 'disconnected' | 'configured' | 'connected' | 'error';

/**
 * Performs a deep health check of the database connection and schema
 */
export const getSupabaseHealth = async (): Promise<{ status: ConnectionStatus; message: string }> => {
  if (!isSupabaseConfigured) {
    return { status: 'disconnected', message: 'Environment variables are missing.' };
  }

  try {
    // Check if the profiles table is accessible (standard check)
    const { error: profileError } = await supabase.from('profiles').select('count', { count: 'exact', head: true }).limit(1);
    
    if (profileError) {
      if (profileError.code === '42P01') return { status: 'error', message: 'Table "profiles" does not exist. Run the SQL patch.' };
      if (profileError.code === 'PGRST301') return { status: 'error', message: 'Invalid API Key / Permissions.' };
      return { status: 'configured', message: `Database error: ${profileError.message}` };
    }

    // Check if the documents table is accessible
    const { error: docError } = await supabase.from('documents').select('count', { count: 'exact', head: true }).limit(1);
    if (docError && docError.code === '42P01') {
      return { status: 'error', message: 'Table "documents" is missing. Persistence is disabled.' };
    }

    return { status: 'connected', message: 'All systems operational.' };
  } catch (err) {
    return { status: 'error', message: 'Network failure or Supabase downtime.' };
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
