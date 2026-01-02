import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Robustly retrieves environment variables from various possible sources.
 * In some environments, process.env is shimmed on the window object.
 */
const getEnv = (key: string): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  if (typeof window !== 'undefined') {
    const win = window as any;
    if (win.process?.env?.[key]) return win.process.env[key];
    if (win.__ENV__?.[key]) return win.__ENV__[key];
  }
  return '';
};

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http')
);

/**
 * Global Supabase instance.
 * We initialize with placeholder values if keys are missing to ensure the object 
 * structure (e.g., .auth) exists, preventing runtime crashes like "reading 'auth' of null".
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
  console.warn("Pedagogy Master: Supabase environment variables are missing or invalid. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
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
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Service Role configuration missing.');
  }
  return createClient(supabaseUrl, serviceRoleKey);
};