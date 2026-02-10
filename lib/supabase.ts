import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';

// Global variable to persist instance across HMR and module re-evaluations
declare global {
  interface Window {
    __supabaseInstance?: SupabaseClient;
    __isDummyInstance?: boolean;
  }
}

/**
 * PRODUCTION CREDENTIAL RESOLVER (v6.0)
 * CRITICAL: References must be EXPLICIT dot-notation for Next.js compiler replacement.
 */
export const getCredentials = () => {
  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : null;

  // 1. Prioritize build-time statically replaced Next.js Public variables
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // 2. Fallback to runtime window-shimmed process.env (common in preview grids)
  if (!url && win?.process?.env?.NEXT_PUBLIC_SUPABASE_URL) {
    url = win.process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (!key && win?.process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    key = win.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }

  // 3. Last resort: direct window properties if injected by external platform
  if (!url && win?.NEXT_PUBLIC_SUPABASE_URL) url = win.NEXT_PUBLIC_SUPABASE_URL;
  if (!key && win?.NEXT_PUBLIC_SUPABASE_ANON_KEY) key = win.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return { 
    url: (url || '').trim(), 
    key: (key || '').trim() 
  };
};

/**
 * VALIDATION NODE
 * Ensures keys are physically present and follow standard Supabase formatting.
 */
export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  const hasUrl = url && (url.startsWith('https://') || url.includes('.supabase.'));
  const hasKey = key && key.length > 40; // Anon keys are long JWTs
  return !!(hasUrl && hasKey);
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
 * THE AUTHENTIC SINGLETON (v6.0 - PRODUCTION STABILIZED)
 * Strictly ensures only ONE client instance exists to prevent GoTrue conflicts.
 */
export const getSupabaseClient = (): SupabaseClient => {
  const isServer = typeof window === 'undefined';

  // Return existing valid instance if available
  if (!isServer && window.__supabaseInstance && !window.__isDummyInstance) {
    return window.__supabaseInstance;
  }

  const { url, key } = getCredentials();
  const configured = isSupabaseConfigured();
  
  // If not configured, return a temporary dummy to prevent boot-up crashes
  if (!configured) {
    const dummyClient = createClient('https://placeholder-node.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-key-placeholder');
    if (!isServer) {
      window.__isDummyInstance = true;
    }
    return dummyClient;
  }
  
  const client = createClient(url, key, {
    auth: { 
      persistSession: true,
      autoRefreshToken: true, 
      detectSessionInUrl: true, 
      flowType: 'pkce',
      storageKey: 'sb-edunexus-auth-unique-v1',
      storage: !isServer ? window.localStorage : undefined
    },
  });

  // Cache strictly for client-side reuse
  if (!isServer) {
    window.__supabaseInstance = client;
    window.__isDummyInstance = false;
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

// Server-side helpers remain decoupled from the browser singleton
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

    const { data: { user } } = await supabase.auth.getUser();
    const metadata = user?.user_metadata || {};
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
