import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Safely retrieves environment variables, checking both standard process.env 
 * and the window shim if needed.
 */
const getEnvVar = (key: string): string => {
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key] as string;
  }
  if (typeof window !== 'undefined' && (window as any).process?.env?.[key]) {
    return (window as any).process.env[key];
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
 */
export const supabase: SupabaseClient = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as any);

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.warn("Pedagogy Master: Supabase credentials not found yet. Infrastructure will attempt lazy recovery on next auth check.");
}

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return { status: 'disconnected', message: 'Environment keys missing in runtime' };
  }
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') return { status: 'error', message: 'Profiles table missing (Run SQL Patch)' };
      return { status: 'error', message: error.message };
    }
    return { status: 'connected', message: 'All systems operational' };
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Network timeout' };
  }
};

export const createPrivilegedClient = () => {
  const serviceRoleKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Service Role configuration missing.');
  }
  return createClient(supabaseUrl, serviceRoleKey);
};