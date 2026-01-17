
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Robust environment variable retrieval.
 * Prioritizes static access for Next.js build-time replacement.
 */
const getEnv = (key: string): string => {
  const sanitize = (v: any) => {
    if (!v) return '';
    const s = String(v).trim();
    if (s === 'undefined' || s === 'null' || s === '[object Object]') return '';
    return s;
  };

  // FAST PATH: Static access for browser bundles
  if (key === 'NEXT_PUBLIC_SUPABASE_URL' && process.env.NEXT_PUBLIC_SUPABASE_URL) return sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
    
    return sanitize(val);
  }
  
  // Server-side / Build-time check
  try {
    return typeof process !== 'undefined' ? sanitize((process.env as any)[key]) : '';
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
      flowType: 'pkce',
      // Explicitly handle storage for incognito/restricted environments
      storageKey: 'edunexus-auth-token',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    },
    global: {
      headers: {
        'x-client-info': 'edunexus-ai/2.3'
      }
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
 * Helper to get authenticated user safely.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('📡 [Auth] User retrieval error:', error.message);
    return null;
  }
  return user;
}

/**
 * Helper to get or create a profile for a user.
 */
export async function getOrCreateProfile(userId: string, email?: string) {
  // Query ONLY this user's profile to satisfy RLS
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    // Profile missing (PGRST116 is Single result error / not found)
    if (error.code === 'PGRST116') {
      console.log('📝 [Profile] Creating missing node for:', userId);
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: email || '',
          name: email?.split('@')[0] || 'Educator',
          role: 'teacher',
          plan: 'free',
          queries_used: 0,
          queries_limit: 30
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ [Profile] Creation failed:', insertError.message);
        return null;
      }
      return newProfile;
    }
    console.error('❌ [Profile] Retrieval failed:', error.message);
    return null;
  }

  return profile;
}

/**
 * Diagnoses Supabase connectivity status.
 */
export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Credentials missing in environment.' };
  }
  try {
    // We check the auth session instead of a protected table to avoid 401 noise in console
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError) {
      return { status: 'disconnected', message: `Auth node unreachable: ${authError.message}` };
    }
    
    return { 
      status: 'connected', 
      message: session ? 'Cloud Node Online (Authenticated)' : 'Cloud Node Online (Guest)' 
    };
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
