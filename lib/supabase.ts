import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';

// Global variable to persist instance across HMR and module re-evaluations
declare global {
  interface Window {
    __supabaseInstance?: SupabaseClient;
  }
}

/**
 * PRODUCTION CREDENTIAL RESOLVER (v9.0)
 * Highly resilient to module hoisting and environment injection.
 */
export const getCredentials = () => {
  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : null;

  // 1. Try local process.env (Build-time or polyfilled)
  let url = '';
  let key = '';

  try {
    url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  } catch (e) {
    // process might not be defined
  }

  // 2. Try window-level process.env (Bridged from index.html/tsx)
  if (!url || url.length < 5) {
    url = win?.process?.env?.NEXT_PUBLIC_SUPABASE_URL || win?.NEXT_PUBLIC_SUPABASE_URL || '';
  }
  if (!key || key.length < 20) {
    key = win?.process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || win?.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  }

  return { 
    url: (url || '').trim(), 
    key: (key || '').trim() 
  };
};

/**
 * Helper to get the site URL for OAuth redirects.
 */
export const getURL = () => {
  let url =
    process?.env?.NEXT_PUBLIC_SITE_URL ?? 
    process?.env?.NEXT_PUBLIC_VERCEL_URL ?? 
    'http://localhost:3000/';
  url = url.includes('http') ? url : `https://${url}`;
  url = url.charAt(url.length - 1) === '/' ? url : `${url}/`;
  return url;
};

/**
 * VALIDATION NODE
 */
export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  return !!(url && url.includes('http') && key && key.length > 10);
};

/**
 * THE AUTHENTIC SINGLETON (v9.0)
 */
export const getSupabaseClient = (): SupabaseClient => {
  const isServer = typeof window === 'undefined';

  if (!isServer && window.__supabaseInstance) {
    return window.__supabaseInstance;
  }

  const { url, key } = getCredentials();
  
  if (!url || !key || key.length < 10) {
    // If not configured, we return a functional but "failed" client for the auth layer to handle
    return createClient(
      'https://placeholder-node.supabase.co', 
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-key-placeholder'
    );
  }
  
  const client = createClient(url, key, {
    auth: { 
      persistSession: true,
      autoRefreshToken: true, 
      detectSessionInUrl: true, 
      flowType: 'pkce',
      storageKey: 'sb-edunexus-auth-stable-v1'
    },
  });

  if (!isServer) {
    window.__supabaseInstance = client;
  }
  
  return client;
};

export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const client = getSupabaseClient() as any;
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  }
});

export const getSupabaseServerClient = (token?: string): SupabaseClient => {
  const { url, key } = getCredentials();
  const options: any = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  if (token) options.global = { headers: { Authorization: `Bearer ${token}` } };
  return createClient(url || 'https://placeholder.supabase.co', key || 'dummy', options);
};

export const getSupabaseAdminClient = (): SupabaseClient => {
  const { url } = getCredentials();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

export async function getOrCreateProfile(userId: string, email?: string) {
  if (!isSupabaseConfigured()) return null;
  const adminString = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
  const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdminUser = email && adminEmails.includes(email.toLowerCase().trim());

  try {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (profile) return profile;
    const metadata = (await supabase.auth.getUser())?.data?.user?.user_metadata || {};
    const fallbackName = metadata.full_name || metadata.name || email?.split('@')[0] || 'Educator';
    const { data: newProfile } = await supabase.from('profiles').upsert({
      id: userId, email: email || '', name: fallbackName,
      role: isAdminUser ? 'app_admin' : 'teacher', plan: isAdminUser ? 'enterprise' : 'free',
      queries_limit: isAdminUser ? 999999 : 30
    }, { onConflict: 'id' }).select().single();
    return newProfile;
  } catch (err) { return null; }
}

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Pending Keys' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Active' };
  } catch (err: any) {
    return { status: 'disconnected', message: 'Offline' };
  }
};