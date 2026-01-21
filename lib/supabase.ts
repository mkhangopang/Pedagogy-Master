import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

let supabaseInstance: SupabaseClient | null = null;

/**
 * MASTER ENVIRONMENT RESOLVER
 * Aggressively scans for Supabase keys in various potential global scopes.
 */
export const getCredentials = () => {
  const isServer = typeof window === 'undefined';
  
  // Scavenge from all possible locations
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    (process.env as any).SUPABASE_URL ||
    (!isServer ? (window as any).NEXT_PUBLIC_SUPABASE_URL : '') || 
    ''
  ).trim();

  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    (process.env as any).SUPABASE_ANON_KEY ||
    (!isServer ? (window as any).NEXT_PUBLIC_SUPABASE_ANON_KEY : '') || 
    ''
  ).trim();

  return { url, key };
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  return !!(url && key && url.includes('supabase.co') && key.length > 20);
};

export const getSupabaseClient = (): SupabaseClient => {
  if (supabaseInstance) return supabaseInstance;

  const { url, key } = getCredentials();
  
  if (!isSupabaseConfigured()) {
    // Return a dummy client to prevent crash, though UI should handle this state
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }

  supabaseInstance = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  return supabaseInstance;
};

/**
 * Creates a new Supabase client for server-side operations, optionally with an auth token.
 */
export const getSupabaseServerClient = (token?: string): SupabaseClient => {
  const { url, key } = getCredentials();
  return createClient(url, key, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
};

// Export a proxy that always uses the latest initialized instance
export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const client = getSupabaseClient() as any;
    return typeof client[prop] === 'function' ? client[prop].bind(client) : client[prop];
  }
});

export async function getOrCreateProfile(userId: string, email?: string) {
  if (!isSupabaseConfigured()) return null;
  const isAdminUser = email && ['mkgopang@gmail.com', ...ADMIN_EMAILS].includes(email.toLowerCase());

  try {
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profile) return profile;

    const { data: newProfile, error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email || '',
        role: isAdminUser ? 'app_admin' : 'teacher',
        plan: isAdminUser ? 'enterprise' : 'free',
        queries_limit: isAdminUser ? 999999 : 30
      }, { onConflict: 'id' })
      .select()
      .single();

    if (upsertError) throw upsertError;
    return newProfile;
  } catch (err) {
    console.error("Profile sync fail:", err);
    return null;
  }
}

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Waiting for environment...' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Neural Node: Active' };
  } catch (err: any) {
    return { status: 'disconnected', message: 'Node unreachable' };
  }
};