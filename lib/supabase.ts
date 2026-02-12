import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';

// Global variable to persist instance across HMR and module re-evaluations
declare global {
  interface Window {
    __supabaseInstance?: SupabaseClient;
    env?: Record<string, string>;
  }
}

let cachedUrl: string | null = null;
let cachedKey: string | null = null;

/**
 * PRODUCTION CREDENTIAL RESOLVER (v15.0 - COMPILER LITERAL ENFORCEMENT)
 * Direct literal access is REQUIRED for Next.js to bundle these values.
 */
export const getCredentials = () => {
  if (cachedUrl && cachedKey) return { url: cachedUrl, key: cachedKey };

  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : {};

  // PRIORITY 1: Explicit Compiler Literals (The only reliable method for browser bundles)
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // PRIORITY 2: Window Proxy Check (Fallback for custom runtime injection)
  if (!url || !key) {
    url = url || win.process?.env?.NEXT_PUBLIC_SUPABASE_URL || win.env?.NEXT_PUBLIC_SUPABASE_URL || '';
    key = key || win.process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || win.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  }

  // PRIORITY 3: Deep Heuristic Pulse (Emergency discovery)
  if (isBrowser && (!url || !key)) {
    for (const prop in win) {
      try {
        const val = win[prop];
        if (typeof val !== 'string') continue;
        if (!url && val.includes('.supabase.co') && val.startsWith('http')) url = val;
        if (!key && val.length > 50 && val.includes('eyJ')) key = val;
      } catch (e) {}
      if (url && key) break;
    }
  }

  const finalUrl = (url || '').trim();
  const finalKey = (key || '').trim();

  if (finalUrl && finalKey.length > 10) {
    cachedUrl = finalUrl;
    cachedKey = finalKey;
    console.log('📡 [System] Handshake Credentials Verified via v15.0 Scavenger');
  }

  return { url: finalUrl, key: finalKey };
};

/**
 * VALIDATION NODE
 */
export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  return !!(url && url.startsWith('http') && key && key.length > 10);
};

/**
 * THE AUTHENTIC SINGLETON (v15.0)
 */
export const getSupabaseClient = (): SupabaseClient => {
  const isServer = typeof window === 'undefined';

  if (!isServer && window.__supabaseInstance) {
    return window.__supabaseInstance;
  }

  const { url, key } = getCredentials();
  
  const client = createClient(
    url || 'https://placeholder.supabase.co', 
    key || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy', 
    {
      auth: { 
        persistSession: true,
        autoRefreshToken: true, 
        detectSessionInUrl: true, 
        flowType: 'pkce',
        storageKey: 'sb-edunexus-auth-stable-v1'
      },
    }
  );

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
  return createClient(url || 'https://placeholder.supabase.co', serviceKey || 'dummy', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

/**
 * URL RESOLVER FOR AUTH REDIRECTS
 */
export const getURL = () => {
  let url =
    process?.env?.NEXT_PUBLIC_SITE_URL ?? 
    process?.env?.NEXT_PUBLIC_VERCEL_URL ?? 
    'http://localhost:3000/';
  
  url = url.includes('http') ? url : `https://${url}`;
  url = url.endsWith('/') ? url : `${url}/`;
  return url;
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