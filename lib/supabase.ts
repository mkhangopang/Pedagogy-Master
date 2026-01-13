
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Robust environment variable retrieval.
 * Prioritizes window.process.env (populated by handshake) over build-time process.env.
 */
const getEnv = (key: string): string => {
  if (typeof window !== 'undefined') {
    const win = window as any;
    // Check injected process env first (from handshake)
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
  return !!url && url.length > 5 && !!key && key.length > 10;
};

let cachedClient: SupabaseClient | null = null;

const getClient = (): SupabaseClient => {
  if (cachedClient) return cachedClient;

  // Fallback only used to prevent SDK crash during initialization; 
  // actual calls are protected by isSupabaseConfigured.
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
 * Main Supabase Client Proxy.
 * Delays initialization until the first call to ensure environment variables 
 * from the neural handshake are fully loaded.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    if (prop === 'then') return undefined;
    const client = getClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') return value.bind(client);
    return value;
  }
});

/**
 * Diagnoses Supabase connectivity status.
 */
export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Cloud credentials (URL/Key) are missing.' };
  }
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      return { status: 'disconnected', message: `Database error: ${error.message}` };
    }
    return { status: 'connected', message: 'Cloud Node Online' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Fatal connection failure' };
  }
};

/**
 * Returns a server-side client with a specific user token for RLS.
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
 * Use only in secure server environments.
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
