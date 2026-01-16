import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Robust environment variable retrieval.
 * Prioritizes static access for Next.js build-time replacement.
 */
const getEnv = (key: string): string => {
  // FAST PATH: Static access for browser bundles
  if (key === 'NEXT_PUBLIC_SUPABASE_URL' && process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (typeof window !== 'undefined') {
    const win = window as any;
    // Check various injection points used by the neural handshake (index.tsx)
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

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!url || !anonKey || url.includes('placeholder')) {
    // Return a dummy client that will fail gracefully or allow setup
    return createClient('https://placeholder-url.supabase.co', 'placeholder-key');
  }

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
      if (error.code === '42P01') return { status: 'disconnected', message: 'Table "profiles" does not exist. Run SQL in Hub.' };
      return { status: 'disconnected', message: `Supabase error: ${error.message}` };
    }
    return { status: 'connected', message: 'Cloud Node Online' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Fatal connection failure' };
  }
};

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