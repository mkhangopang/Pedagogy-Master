
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';

declare global {
  interface Window {
    __supabaseInstance?: SupabaseClient;
    env?: Record<string, string>;
  }
}

let cachedUrl: string | null = null;
let cachedKey: string | null = null;

/**
 * PRODUCTION CREDENTIAL RESOLVER (v31.0 - ULTRA RESILIENT)
 * Orchestrates an aggressive search for infrastructure keys to fix discovery exhaustion.
 */
export const getCredentials = () => {
  if (cachedUrl && cachedKey) return { url: cachedUrl, key: cachedKey };

  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : {};

  const isValid = (val: string | undefined | null) => {
    if (!val) return false;
    const v = val.trim();
    // Allow placeholders for local/dev, but trigger config warnings
    return v !== '' && v !== 'undefined' && v !== 'null';
  };

  // TIER 1: Explicit Compiler Literals
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // TIER 2: Unified Namespace Scan (Deep Crawl)
  if (!isValid(url) || !isValid(key)) {
    const sources = [
      win.env,
      win.process?.env,
      win.ai_config, // Common injection point for some AI platforms
      isBrowser ? JSON.parse(localStorage.getItem('sb-infra-cache') || '{}') : null,
      win
    ].filter(Boolean);

    for (const src of sources) {
      if (!isValid(url)) url = src.NEXT_PUBLIC_SUPABASE_URL || src.SUPABASE_URL || '';
      if (!isValid(key)) key = src.NEXT_PUBLIC_SUPABASE_ANON_KEY || src.SUPABASE_ANON_KEY || '';
      if (isValid(url) && isValid(key) && url.startsWith('http')) break;
    }
  }

  const finalUrl = (url || '').trim();
  const finalKey = (key || '').trim();

  if (finalUrl.startsWith('http') && finalKey.length >= 10) {
    cachedUrl = finalUrl;
    cachedKey = finalKey;
    console.log('📡 [System] Handshake: Credentials Resolved.');
  }

  return { url: finalUrl, key: finalKey };
};

export const pulseCredentialsFromServer = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  try {
    const res = await fetch('/api/check-env', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    
    if (data.config?.url && data.config?.key) {
      const win = window as any;
      win.env = win.env || {};
      win.env.NEXT_PUBLIC_SUPABASE_URL = data.config.url;
      win.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = data.config.key;
      refreshSupabaseInstance();
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  // Fixed logic: URL must start with http and key must have some length
  return !!(url && url.startsWith('http') && key && key.length > 20);
};

export const refreshSupabaseInstance = () => {
  if (typeof window !== 'undefined') {
    delete (window as any).__supabaseInstance;
    cachedUrl = null;
    cachedKey = null;
  }
};

export const getSupabaseClient = (): SupabaseClient => {
  const isServer = typeof window === 'undefined';
  if (!isServer && (window as any).__supabaseInstance) {
    return (window as any).__supabaseInstance;
  }

  const { url, key } = getCredentials();
  const isValid = url.startsWith('http') && key.length > 20;
  
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

export const getURL = () => {
  let url = process?.env?.NEXT_PUBLIC_SITE_URL ?? process?.env?.NEXT_PUBLIC_VERCEL_URL ?? 'http://localhost:3000/';
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
