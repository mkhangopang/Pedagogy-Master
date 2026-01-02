import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Robustly retrieves environment variables using process.env.
 * This ensures compatibility with Next.js 14 and environment shims.
 */
const getEnvVar = (key: string): string => {
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key] as string;
  }
  return '';
};

const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http')
);

/**
 * Global Supabase instance.
 * We initialize with placeholder values if keys are missing to ensure the object 
 * structure (e.g., .auth) exists, preventing runtime crashes.
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDI0MjI4OTIsImV4cCI6MTk1ODAwMjg5Mn0.placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.warn("Pedagogy Master: Cloud configuration missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured) {
    return { status: 'disconnected', message: 'Environment keys missing in runtime.' };
  }
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') return { status: 'error', message: 'Infrastructure tables missing (Run SQL Patch).' };
      return { status: 'error', message: error.message };
    }
    return { status: 'connected', message: 'All systems operational.' };
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Network timeout.' };
  }
};

export const createPrivilegedClient = () => {
  const serviceRoleKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Service Role configuration missing.');
  }
  return createClient(supabaseUrl, serviceRoleKey);
};