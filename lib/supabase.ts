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
 * PRODUCTION CREDENTIAL RESOLVER (v30.0 - ATOMIC CONSENSUS)
 * Orchestrates a multi-tier search for infrastructure keys.
 */
export const getCredentials = () => {
  if (cachedUrl && cachedKey) return { url: cachedUrl, key: cachedKey };

  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : {};

  // HELPER: Validate a string is not a placeholder or empty
  const isValid = (val: string | undefined | null) => {
    if (!val) return false;
    const v = val.trim().toLowerCase();
    return v !== '' && v !== 'undefined' && v !== 'null' && !v.includes('placeholder');
  };

  // TIER 1: Explicit Compiler Literals (Next.js Build-Time Inlining)
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // TIER 2: Unified Namespace Scan
  if (!isValid(url) || !isValid(key)) {
    const sources = [
      win.env,
      win.process?.env,
      isBrowser ? JSON.parse(localStorage.getItem('sb-infra-cache') || '{}') : null,
      win // Scan window root
    ].filter(Boolean);

    for (const src of sources) {
      if (!isValid(url)) url = src.NEXT_PUBLIC_SUPABASE_URL || src.SUPABASE_URL || '';
      if (!isValid(key)) key = src.NEXT_PUBLIC_SUPABASE_ANON_KEY || src.SUPABASE_ANON_KEY || '';
      if (isValid(url) && isValid(key) && url.startsWith('http')) break;
    }
  }

  // TIER 3: Deep Global Scavenger (Last Resort Regex)
  if (isBrowser && (!isValid(url) || !isValid(key))) {
    try {
      Object.keys(win).forEach(prop => {
        const val = win[prop];
        if (typeof val !== 'string') return;
        if (!isValid(url) && val.includes('.supabase.co') && val.startsWith('http')) url = val;
        if (!isValid(key) && val.length > 50 && val.includes('eyJ')) key = val;
      });
    } catch (e) {}
  }

  const finalUrl = (url || '').trim();
  const finalKey = (key || '').trim();

  // FINAL VERIFICATION
  if (finalUrl.startsWith('http') && finalKey.length >= 10 && !finalUrl.includes('placeholder')) {
    cachedUrl = finalUrl;
    cachedKey = finalKey;
    
    if (isBrowser) {
      // Anchor keys across all sources to prevent logic drift
      win.env = win.env || {};
      win.env.NEXT_PUBLIC_SUPABASE_URL = finalUrl;
      win.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = finalKey;
      
      win.process = win.process || { env: {} };
      win.process.env = win.process.env || {};
      win.process.env.NEXT_PUBLIC_SUPABASE_URL = finalUrl;
      win.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = finalKey;

      try {
        localStorage.setItem('sb-infra-cache', JSON.stringify({
          NEXT_PUBLIC_SUPABASE_URL: finalUrl,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: finalKey
        }));
      } catch (e) {}
    }
    console.log('📡 [System] Handshake: Credentials Verified via v30.0');
  }

  return { url: finalUrl, key: finalKey };
};

/**
 * INFRASTRUCTURE PULSE: Recovers configuration from the server-side diagnostics
 */
export const pulseCredentialsFromServer = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  try {
    const res = await fetch('/api/check-env', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    
    if (data.config?.url && data.config?.key && !data.config.url.includes('placeholder')) {
      const win = window as any;
      win.env = win.env || {};
      win.env.NEXT_PUBLIC_SUPABASE_URL = data.config.url;
      win.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = data.config.key;
      
      console.log('📡 [System] Infrastructure Pulse: KEYS_RECOVERED');
      refreshSupabaseInstance();
      return true;
    }
    return false;
  } catch (err) {
    console.error('📡 [System] Infrastructure Pulse: Fatal Node Error', err);
    return false;
  }
};

/**
 * CONFIGURATION VALIDATOR
 */
export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  return !!(url && url.startsWith('http') && key && key.length >= 10 && !url.includes('placeholder'));
};

/**
 * INSTANCE REFRESH
 */
export const refreshSupabaseInstance = () => {
  if (typeof window !== 'undefined') {
    delete (window as any).__supabaseInstance;
    cachedUrl = null;
    cachedKey = null;
  }
};

/**
 * THE AUTHENTIC SINGLETON (v30.0)
 */
export const getSupabaseClient = (): SupabaseClient => {
  const isServer = typeof window === 'undefined';

  if (!isServer && (window as any).__supabaseInstance) {
    return (window as any).__supabaseInstance;
  }

  const { url, key } = getCredentials();
  const isValid = url.startsWith('http') && key.length >= 10 && !url.includes('placeholder');
  
  const client = createClient(
    isValid ? url : 'https://placeholder.supabase.co', 
    isValid ? key : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder', 
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

  if (!isServer && isValid) {
    (window as any).__supabaseInstance = client;
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