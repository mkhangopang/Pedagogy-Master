
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { DEFAULT_MASTER_PROMPT } from '../constants';

// Use a truly global singleton to survive HMR and module re-evaluation
const getGlobalSupabase = (): SupabaseClient | null => {
  if (typeof window !== 'undefined') {
    return (window as any).__supabaseInstance || null;
  }
  return null;
};

const setGlobalSupabase = (client: SupabaseClient) => {
  if (typeof window !== 'undefined') {
    (window as any).__supabaseInstance = client;
  }
};

let supabaseInstance: SupabaseClient | null = null;

export const getCredentials = () => {
  const isBrowser = typeof window !== 'undefined';
  
  // Try to find URL and Key from multiple potential locations
  // 1. process.env (Polyfilled or injected)
  // 2. window.process.env (Set by index.tsx)
  // 3. window directly (Legacy/Fallback)
  
  const getVar = (name: string): string => {
    if (process.env[name]) return process.env[name] as string;
    if (isBrowser && (window as any).process?.env?.[name]) return (window as any).process.env[name];
    if (isBrowser && (window as any)[name]) return (window as any)[name];
    return '';
  };

  const url = getVar('NEXT_PUBLIC_SUPABASE_URL').trim();
  const key = getVar('NEXT_PUBLIC_SUPABASE_ANON_KEY').trim();
  
  return { url, key };
};

export const getURL = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  return !!(url && url.startsWith('https://') && key && key.length > 20);
};

export const getSupabaseClient = (): SupabaseClient => {
  // Priority: Global instance from window (prevents GoTrue warnings)
  const globalClient = getGlobalSupabase();
  if (globalClient) return globalClient;
  
  // Secondary: Module level singleton
  if (supabaseInstance) return supabaseInstance;

  const { url, key } = getCredentials();
  if (!isSupabaseConfigured()) {
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }
  
  const isServer = typeof window === 'undefined';
  
  // Standard Client
  const client = createClient(url, key, {
    auth: { 
      persistSession: true,
      autoRefreshToken: true, 
      detectSessionInUrl: true, 
      flowType: 'pkce',
      storageKey: 'sb-edunexus-auth-token',
      storage: !isServer ? window.localStorage : undefined
    },
  });

  setGlobalSupabase(client);
  supabaseInstance = client;
  return client;
};

/**
 * Server-specific client. 
 * persistSession: false is CRITICAL here to prevent storage clashes on client side.
 */
export const getSupabaseServerClient = (token?: string): SupabaseClient => {
  const { url, key } = getCredentials();
  if (!isSupabaseConfigured()) return createClient('https://placeholder.supabase.co', 'placeholder-key');

  const options: any = {
    auth: { 
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
  };

  if (token) {
    options.global = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  return createClient(url, key, options);
};

/**
 * ADMIN CLIENT (Server-only)
 * Uses service role key to bypass RLS for critical system processing.
 */
export const getSupabaseAdminClient = (): SupabaseClient => {
  const { url } = getCredentials();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, serviceKey, {
    auth: { 
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
  });
};

export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const client = getSupabaseClient() as any;
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  }
});

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
        tenant_config: { primary_color: '#4f46e5', brand_name: 'EduNexus AI' }
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
