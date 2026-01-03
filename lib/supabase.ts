import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * RESOLVE ENV VARIABLE
 * Robust lookup for environment variables across common global namespaces.
 */
const getEnv = (key: string): string => {
  if (typeof window === 'undefined') return process.env[key] || '';
  
  const win = window as any;
  // Check in order: direct process.env, direct window, window.process.env
  const val = process.env[key] || win[key] || win.process?.env?.[key] || '';
  
  return (val === 'undefined' || val === 'null') ? '' : val;
};

/**
 * Validates if the cloud environment is correctly setup.
 */
export const isSupabaseConfigured = (): boolean => {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  
  return (
    !!url && 
    !!key && 
    url.trim() !== '' &&
    key.trim() !== '' &&
    url.startsWith('http')
  );
};

/**
 * Infrastructure Handshake Logging
 * Provides developer feedback in the console without exposing sensitive keys.
 */
if (typeof window !== 'undefined') {
  // Use a delay to ensure it runs after the index.tsx handshake completes
  setTimeout(() => {
    if (!isSupabaseConfigured()) {
      console.group('🚨 Pedagogy Master: Configuration Alert');
      console.warn('The application is running in an unconfigured state.');
      console.info('Verify NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are provided.');
      console.info('Current check paths: process.env, window.KEY, window.process.env');
      console.groupEnd();
    } else {
      const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
      console.log('✅ Supabase Node Connected:', url.split('.')[0].replace('https://', ''));
    }
  }, 200);
}

/**
 * Global Supabase Client Instance
 * Initialized with resolved values. Using a constant here is fine because 
 * components using it are dynamically imported after the index.tsx handshake.
 */
export const supabase: SupabaseClient = createClient(
  getEnv('NEXT_PUBLIC_SUPABASE_URL') || 'https://placeholder-project.supabase.co',
  getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || 'placeholder-anon-key',
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
 * Validation Middleware
 * Throws an explicit error if the client is invoked without valid credentials.
 */
export const ensureSupabase = () => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase client is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return supabase;
};

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
      // 42P01: Table does not exist (Schema issue)
      if (error.code === '42P01') {
        return { 
          status: 'error', 
          message: 'Schema missing. Open Brain Control to deploy SQL patch.' 
        };
      }
      // PGRST301: JWT expired or invalid key
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