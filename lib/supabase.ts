
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Robust environment variable retrieval.
 * Prioritizes window.process.env (populated by handshake) over build-time process.env.
 */
const getEnv = (key: string): string => {
  if (typeof window !== 'undefined') {
    const win = window as any;
    // Check various injection points used by the neural handshake
    const val = 
      win.process?.env?.[key] || 
      win[key] || 
      win.env?.[key] || 
      (import.meta as any).env?.[key] || 
      (typeof process !== 'undefined' ? (process.env as any)[key] : '') ||
      '';
    
    if (val && val !== 'undefined' && val !== 'null' && String(val).trim() !== '') return String(val).trim();
  }
  
  // Server-side / Build-time check
  try {
    return typeof process !== 'undefined' ? (process.env as any)[key] || '' : '';
  } catch {
    return '';
  }
};

/**
 * Checks if the minimum required configuration for Supabase exists.
 */
export const isSupabaseConfigured = (): boolean => {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return !!url && url.length > 10 && !!key && key.length > 10;
};

let cachedClient: SupabaseClient | null = null;

const getClient = (): SupabaseClient => {
  if (cachedClient) return cachedClient;

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL') || 'https://placeholder.supabase.co';
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || 'placeholder';

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
 * Main Supabase Client Proxy.
 * Delays real initialization until the first access to property,
 * allowing the Neural Handshake to populate environment variables first.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop, receiver) => {
    if (prop === 'then') return undefined;
    
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

/**
 * Diagnoses Supabase connectivity status.
 */
export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Credentials missing in environment.' };
  }
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      return { status: 'disconnected', message: `Supabase error: ${error.message}` };
    }
    return { status: 'connected', message: 'Cloud Node Online' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Fatal connection failure' };
  }
};

/**
 * Returns a client with a specific user token for RLS.
 */
export const getSupabaseServerClient = (token: string): SupabaseClient => {
  return createClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );
};

/**
 * Returns a high-privilege client using the service role key.
 */
export const getSupabaseAdminClient = (): SupabaseClient => {
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
};
