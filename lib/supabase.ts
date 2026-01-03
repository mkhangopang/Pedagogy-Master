import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * RESOLVE ENV VARIABLE
 * Simplified lookup for environment variables.
 * Next.js automatically injects NEXT_PUBLIC_ variables into the client bundle.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Validates if the cloud environment is correctly setup.
 */
export const isSupabaseConfigured = (): boolean => {
  return (
    !!supabaseUrl && 
    !!supabaseAnonKey && 
    supabaseUrl !== 'https://placeholder-project.supabase.co' &&
    supabaseUrl.startsWith('http')
  );
};

/**
 * Global Supabase Client Instance
 * Created with resolved values or placeholders to prevent runtime crashes.
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
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
 * Health Diagnostics
 * Performs a round-trip query to verify database connectivity and schema readiness.
 */
export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Credentials missing from environment.' };
  }

  try {
    // Attempt a light metadata query
    const { error } = await supabase.from('profiles').select('id').limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        return { 
          status: 'error', 
          message: 'Schema missing. Open Brain Control to deploy SQL patch.' 
        };
      }
      if (error.code === 'PGRST301') {
        return { status: 'error', message: 'Invalid API Key or expired session.' };
      }
      return { status: 'error', message: `Database error [${error.code}]: ${error.message}` };
    }

    return { status: 'connected', message: 'Infrastructure Operational' };
  } catch (err: any) {
    return { 
      status: 'error', 
      message: err.message || 'Cloud node handshake timeout' 
    };
  }
};
