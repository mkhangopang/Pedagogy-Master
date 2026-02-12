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
 * PRODUCTION CREDENTIAL RESOLVER (v16.0 - ZERO-TRUST DISCOVERY)
 * Exhaustively scans all possible namespaces for Supabase identity tokens.
 */
export const getCredentials = () => {
  if (cachedUrl && cachedKey) return { url: cachedUrl, key: cachedKey };

  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : {};

  // TIER 1: Standard Search (Prefixed & Unprefixed)
  const searchFor = (keyName: string): string => {
    const keysToTry = [
      `NEXT_PUBLIC_${keyName}`,
      `VITE_${keyName}`,
      `REACT_APP_${keyName}`,
      keyName
    ];

    for (const k of keysToTry) {
      // 1. Literal process.env (Bundler replacement)
      try { if (process.env[k]) return String(process.env[k]); } catch (e) {}
      // 2. Global process.env
      try { if (win.process?.env?.[k]) return String(win.process.env[k]); } catch (e) {}
      // 3. Global env object
      try { if (win.env?.[k]) return String(win.env[k]); } catch (e) {}
      // 4. Direct window property
      try { if (win[k]) return String(win[k]); } catch (e) {}
    }
    return '';
  };

  let url = searchFor('SUPABASE_URL');
  let key = searchFor('SUPABASE_ANON_KEY');

  // TIER 2: Deep Pattern Matching (Heuristic Discovery)
  if (isBrowser && (!url || !key)) {
    console.debug('📡 [System] Standard credential search failed. Initiating Deep Pattern Match...');
    
    // Scan all window properties for Supabase signatures
    for (const prop in win) {
      try {
        const val = win[prop];
        if (typeof val !== 'string') continue;
        
        // URL Pattern: looks like a Supabase project URL
        if (!url && val.includes('.supabase.co') && val.startsWith('http')) {
          console.debug(`📡 [System] Heuristic match for URL: ${prop}`);
          url = val;
        }
        // Key Pattern: looks like a Supabase JWT (starts with eyJ and is long)
        if (!key && val.length > 50 && val.includes('eyJ')) {
          console.debug(`📡 [System] Heuristic match for KEY: ${prop}`);
          key = val;
        }
      } catch (e) {}
      if (url && key) break;
    }
  }

  const finalUrl = (url || '').trim();
  const finalKey = (key || '').trim();

  // Validate and Cache
  if (finalUrl.startsWith('http') && finalKey.length > 10) {
    cachedUrl = finalUrl;
    cachedKey = finalKey;
    console.log('📡 [System] Infrastructure Handshake: CREDENTIALS_RESOLVED_V16');
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
 * THE AUTHENTIC SINGLETON (v16.0)
 */
export const getSupabaseClient = (): SupabaseClient => {
  const isServer = typeof window === 'undefined';

  if (!isServer && window.__supabaseInstance) {
    return window.__supabaseInstance;
  }

  const { url, key } = getCredentials();
  
  // Use placeholder if not configured to prevent crash, but validation should catch this
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

// Proxy export for ease of use
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
      id: userId, 
      email: email || '', 
      name: fallbackName,
      role: isAdminUser ? 'app_admin' : 'teacher', 
      plan: isAdminUser ? 'enterprise' : 'free',
      queries_limit: isAdminUser ? 999999 : 30
    }, { onConflict: 'id' }).select().single();
    
    return newProfile;
  } catch (err) { 
    return null; 
  }
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