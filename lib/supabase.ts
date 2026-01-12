
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Robust environment variable retrieval.
 * Prioritizes window.process.env (populated by handshake) over build-time process.env.
 */
const getEnv = (key: string): string => {
  if (typeof window !== 'undefined') {
    const win = window as any;
    // Check various common locations for environment variables
    const val = win.process?.env?.[key] || win[key] || (import.meta as any).env?.[key] || '';
    if (val && val !== 'undefined' && val !== 'null') return val;
  }
  try {
    return typeof process !== 'undefined' ? process.env[key] || '' : '';
  } catch {
    return '';
  }
};

/**
 * Validates if the Supabase configuration is present and valid.
 * Checks dynamically to ensure it catches variables added after module load.
 */
export const isSupabaseConfigured = (): boolean => {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return (
    !!url && 
    !!key && 
    url !== 'https://placeholder-project.supabase.co' &&
    url.startsWith('http')
  );
};

let cachedClient: SupabaseClient | null = null;

/**
 * Internal getter for the Supabase client instance.
 * Implements lazy initialization to capture handshake variables.
 */
const getClient = (): SupabaseClient => {
  if (cachedClient) return cachedClient;

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL') || 'https://placeholder-project.supabase.co';
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || 'placeholder-anon-key';

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  return cachedClient;
};

/**
 * Exported Supabase client proxy.
 * This allows all existing imports (import { supabase } from ...) to continue working
 * while delaying actual initialization until a property is accessed.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const client = getClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  return createClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  );
};

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Credentials missing from environment.' };
  }

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 3500)
    );

    const queryPromise = supabase.from('profiles').select('id').limit(1);

    const { error } = (await Promise.race([queryPromise, timeoutPromise])) as any;
    
    if (error) {
      if (error.code === '42P01') {
        return { 
          status: 'error', 
          message: 'Schema missing. Open Brain Control to deploy SQL patch.' 
        };
      }
      return { status: 'error', message: `Database error [${error.code}]` };
    }

    return { status: 'connected', message: 'Infrastructure Operational' };
  } catch (err: any) {
    return { 
      status: 'error', 
      message: err.message === 'Connection timeout' ? 'Cloud node unreachable' : 'Handshake failure'
    };
  }
};
