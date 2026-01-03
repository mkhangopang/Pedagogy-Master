import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * DIRECT ENVIRONMENT RESOLUTION
 * Priority: process.env > window.__ENV__ > window
 */
const getEnv = (key: string): string => {
  if (typeof process !== 'undefined' && process.env?.[key]) return process.env[key] as string;
  if ((window as any).process?.env?.[key]) return (window as any).process.env[key];
  if ((window as any).__ENV__?.[key]) return (window as any).__ENV__[key];
  if ((window as any)[key]) return (window as any)[key];
  return '';
};

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

/**
 * Validates if the cloud environment is correctly setup.
 */
export const isSupabaseConfigured = (): boolean => {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return !!(url && key && url.startsWith('http'));
};

// Diagnostic handshake
if (typeof window !== 'undefined') {
  console.log('🌐 Supabase Handshake:', isSupabaseConfigured() ? '✅ Ready' : '⚠️ Missing Credentials');
}

/**
 * Global Supabase Client
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  }
);

/**
 * Verifies live connectivity
 */
export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Environment variables not detected.' };
  }
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') return { status: 'error', message: 'Schema missing. Run SQL patch.' };
      return { status: 'error', message: error.message };
    }
    return { status: 'connected', message: 'Operational' };
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Connection timeout' };
  }
};
