import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';

// Global variable to persist instance across HMR and module re-evaluations
declare global {
  interface Window {
    __supabaseInstance?: SupabaseClient;
  }
}

/**
 * PRODUCTION CREDENTIAL RESOLVER (v7.0)
 * Optimized for Next.js build-time replacement and runtime fallback.
 */
export const getCredentials = () => {
  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : null;

  // 1. Build-time statically replaced Next.js variables
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // 2. Runtime fallback (Checks window, process.env, and window-shimming)
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
 * VALIDATION NODE
 * Simple existence check to prevent premature initialization failures.
 */
export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  return !!(url && url.includes('http') && key && key.length > 20);
};

/**
 * Resolves the site URL for OAuth redirects and emails.
 */
export const getURL = () => {
  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : null;

  let url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    win?.process?.env?.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    'http://localhost:3000/';
  
  url = url.includes('http') ? url : `https://${url}`;
  url = url.endsWith('/') ? url : `${url}/`;
  return url;
};

/**
 * THE AUTHENTIC SINGLETON (v7.0 - STABILIZED)
 * Strictly ensures only ONE real client instance exists.
 * Does NOT cache dummy instances to allow for runtime key injection.
 */
export const getSupabaseClient = (): SupabaseClient => {
  const isServer = typeof window === 'undefined';

  // If we have a cached REAL instance, return it immediately
  if (!isServer && window.__supabaseInstance) {
    return window.__supabaseInstance;
  }

  const { url, key } = getCredentials();
  const configured = isSupabaseConfigured();
  
  if (!configured) {
    // Return a transient dummy client. We DO NOT store this in window.__supabaseInstance
    // so that subsequent calls can try again if keys appear later.
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
      storageKey: 'sb-edunexus-auth-stable-v1',
      storage: !isServer ? window.localStorage : undefined
    },
  });

  if (!isServer) {
    window.__supabaseInstance = client;
  }
  
  return client;
};

/**
 * Proxy-based Export
 * Automatically points to the most up-to-date client instance.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const client = getSupabaseClient() as any;
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  }
});

// Server-side helpers
export const getSupabaseServerClient = (token?: string): SupabaseClient => {
  const { url, key } = getCredentials();
  if (!isSupabaseConfigured()) return createClient('https://placeholder.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-key');

  const options: any = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };

  if (token) {
    options.global = { headers: { Authorization: `Bearer ${token}` } };
  }

  return createClient(url, key, options);
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
    
    if (profile && isAdminUser && profile.role !== 'app_admin') {
      const { data: updated } = await supabase
        .from('profiles')
        .update({ role: 'app_admin', plan: 'enterprise', queries_limit: 999999 })
        .eq('id', userId)
        .select()
        .single();
      return updated;
    }
    
    if (profile) return profile;

    const metadata = (await supabase.auth.getUser())?.data?.user?.user_metadata || {};
    const fallbackName = metadata.full_name || metadata.name || email?.split('@')[0] || 'Educator';

    const { data: newProfile, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email || '',
        name: fallbackName,
        role: isAdminUser ? 'app_admin' : 'teacher',
        plan: isAdminUser ? 'enterprise' : 'free',
        queries_limit: isAdminUser ? 999999 : 30,
        tenant_config: { primary_color: '#4f46e5', brand_name: 'Pedagogy Master AI' }
      }, { onConflict: 'id' })
      .select().single();

    if (error) throw error;
    return newProfile;
  } catch (err) {
    console.error("Profile sync fail:", err);
    return null;
  }
}

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Offline' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Active' };
  } catch (err: any) {
    return { status: 'disconnected', message: 'Offline' };
  }
};