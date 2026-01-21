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
  
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    (!isServer ? (window as any).NEXT_PUBLIC_SUPABASE_URL : '') || 
    ''
  ).trim();

  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    (!isServer ? (window as any).NEXT_PUBLIC_SUPABASE_ANON_KEY : '') || 
    ''
  ).trim();

  return { url, key };
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  return !!(url && url.startsWith('https://') && key && key.length > 20);
};

export const getSupabaseClient = (): SupabaseClient => {
  if (supabaseInstance) return supabaseInstance;

  const { url, key } = getCredentials();
  
  if (!isSupabaseConfigured()) {
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }

  supabaseInstance = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
    global: {
      headers: { 'x-application-name': 'edunexus-ai' },
    },
  });

  return supabaseInstance;
};

// Added getSupabaseServerClient to handle server-side requests with auth tokens
export const getSupabaseServerClient = (token?: string): SupabaseClient => {
  const { url, key } = getCredentials();
  
  if (!isSupabaseConfigured()) {
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { 
        'x-application-name': 'edunexus-ai',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
    },
  });
};

export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const client = getSupabaseClient() as any;
    return typeof client[prop] === 'function' ? client[prop].bind(client) : client[prop];
  }
});

export async function getOrCreateProfile(userId: string, email?: string) {
  if (!isSupabaseConfigured()) return null;
  const isAdminUser = email && ADMIN_EMAILS.includes(email.toLowerCase());

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
        queries_limit: isAdminUser ? 999999 : 30,
        created_at: new Date().toISOString()
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
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Infrastructure node initializing...' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Neural Node: Active' };
  } catch (err: any) {
    return { status: 'disconnected', message: 'Node unreachable - check Vercel Keys' };
  }
};