
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
      (typeof process !== 'undefined' ? process.env[key] : '') ||
      '';
    
    if (val && val !== 'undefined' && val !== 'null') return String(val).trim();
  }
  try {
    return typeof process !== 'undefined' ? process.env[key] || '' : '';
  } catch {
    return '';
  }
};

export const isSupabaseConfigured = (): boolean => {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  
  // Basic structure check for Supabase URL and Key
  const isValidUrl = !!url && url.length > 10 && url.includes('supabase.co');
  const isValidKey = !!key && key.length > 20;

  if (!isValidUrl || !isValidKey) {
    console.warn('[Infrastructure Diagnostics] Supabase configuration is incomplete:', {
      url: url ? 'PRESENT' : 'MISSING',
      key: key ? 'PRESENT' : 'MISSING'
    });
  }

  return isValidUrl && isValidKey;
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

export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    if (prop === 'then') return undefined;
    const client = getClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') return value.bind(client);
    return value;
  }
});

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  return createClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      global: {
        headers: { Authorization: `Bearer ${token}` }
      }
    }
  );
};

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Credentials missing (URL/Key).' };
  }

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 3500)
    );

    const queryPromise = supabase.from('profiles').select('id').limit(1);
    const { error } = (await Promise.race([queryPromise, timeoutPromise])) as any;
    
    if (error) {
      if (error.code === '42P01') return { status: 'error', message: 'Schema missing. Run SQL patch in Control Hub.' };
      return { status: 'error', message: `Database error [${error.code}]` };
    }

    return { status: 'connected', message: 'Infrastructure Operational' };
  } catch (err: any) {
    return { status: 'error', message: err.message === 'Connection timeout' ? 'Cloud node unreachable' : 'Handshake failure' };
  }
};
