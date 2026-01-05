
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * RESOLVE ENV VARIABLE
 * Simplified lookup for environment variables.
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
 * Server-Side Authenticated Client
 */
export const getSupabaseServerClient = (token: string): SupabaseClient => {
  return createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  );
};

/**
 * Health Diagnostics with Timeout
 * Ensures the app doesn't hang if the database is unresponsive.
 */
export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Credentials missing from environment.' };
  }

  try {
    // Create a promise that rejects after 5 seconds
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );

    // Attempt a light metadata query with a race against the timeout
    const queryPromise = supabase.from('profiles').select('id').limit(1);

    const { error } = (await Promise.race([queryPromise, timeoutPromise])) as any;
    
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
      message: err.message === 'Connection timeout' ? 'Cloud node unreachable (Timeout)' : (err.message || 'Cloud node handshake failure')
    };
  }
};
