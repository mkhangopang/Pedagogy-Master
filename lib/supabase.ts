import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Robust environment variable retrieval.
 * Prioritizes window.process.env (populated by handshake) over build-time process.env.
 */
const getEnv = (key: string): string => {
  if (typeof window !== 'undefined') {
    const win = window as any;
    // Check various common locations for environment variables
    const val = 
      win.process?.env?.[key] || 
      win[key] || 
      win.env?.[key] || 
      (import.meta as any).env?.[key] || 
      (typeof process !== 'undefined' ? process.env[key] : '') ||
      '';
    
    if (val && val !== 'undefined' && val !== 'null') return String(val).trim();
  }
  try {
    // Standard Node/Next process.env
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
  
  const isValidUrl = !!url && url !== 'https://placeholder-project.supabase.co' && url.startsWith('http');
  const isValidKey = !!key && key !== 'placeholder-anon-key' && key.length > 20;

  if (!isValidUrl || !isValidKey) {
    console.warn('Supabase Configuration Missing:', { 
      url: url ? (url.substring(0, 10) + '...') : 'MISSING', 
      keyLength: key?.length || 0 
    });
  }

  return isValidUrl && isValidKey;
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
    // Handle standard JS behavior for proxies
    if (prop === 'then') return undefined;
    
    const client = getClient();
    const value = (client as any)[prop];
    
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
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