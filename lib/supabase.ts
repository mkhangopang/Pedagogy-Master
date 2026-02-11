
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';

// Global variable to persist instance across HMR and module re-evaluations
declare global {
  interface Window {
    __supabaseInstance?: SupabaseClient;
  }
}

/**
 * PRODUCTION CREDENTIAL RESOLVER (v8.0)
 * Highly resilient to different injection environments.
 */
export const getCredentials = () => {
  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : null;

  // 1. Build-time statically replaced Next.js variables
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // 2. Runtime fallback (Checks window, bridged process.env, and global scope)
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

// Add comment above each fix
// Fix: Added missing getURL helper for OAuth redirect handling in views/Login.tsx
/**
 * Helper to get the site URL for OAuth redirects.
 */
export const getURL = () => {
  let url =
    process?.env?.NEXT_PUBLIC_SITE_URL ?? // Set this to your site URL in production env.
    process?.env?.NEXT_PUBLIC_VERCEL_URL ?? // Automatically set on Vercel.
    'http://localhost:3000/';
  // Make sure to include `https://` when not localhost.
  url = url.includes('http') ? url : `https://${url}`;
  // Make sure to include a trailing `/`.
  url = url.charAt(url.length - 1) === '/' ? url : `${url}/`;
  return url;
};

/**
 * VALIDATION NODE
 * Checks if we have enough info to at least TRY a connection.
 */
export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  // We check for minimal length to allow the app to attempt loading
  return !!(url && url.includes('http') && key && key.length > 10);
};

/**
 * THE AUTHENTIC SINGLETON (v8.0)
 */
export const getSupabaseClient = (): SupabaseClient => {
  const isServer = typeof window === 'undefined';

  if (!isServer && window.__supabaseInstance) {
    return window.__supabaseInstance;
  }

  const { url, key } = getCredentials();
  
  // If not configured, we return a dummy but DO NOT cache it, 
  // allowing a real client to be created once keys are available.
  if (!url || !key || key.length < 10) {
    return createClient(
      'https://placeholder.supabase.co', 
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy'
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
