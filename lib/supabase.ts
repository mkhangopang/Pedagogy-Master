import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * DIRECT PLATFORM RESOLUTION
 * Trusting the environment secrets provided by the host.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Validates if the cloud environment is correctly setup.
 */
export const isSupabaseConfigured = (): boolean => {
  return !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));
};

// Console diagnostics for infrastructure verification
if (typeof window !== 'undefined') {
  console.log('🌐 Pedagogy Master: Cloud Handshake initiated');
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Infrastructure credentials not detected in process.env. Verify .env.local or platform secrets.');
  } else {
    console.log('✅ Infrastructure verified:', supabaseUrl?.substring(0, 20) + '...');
  }
}

/**
 * Global Supabase Client
 * We use the discovered credentials or placeholders for non-blocking initialization.
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
    return { status: 'disconnected', message: 'Environment variables missing.' };
  }
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') return { status: 'error', message: 'Schema missing. Please run the SQL patch in Brain Control.' };
      return { status: 'error', message: error.message };
    }
    return { status: 'connected', message: 'Infrastructure Operational' };
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Handshake timeout' };
  }
};
