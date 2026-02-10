
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
  
  /**
   * CRITICAL: Next.js only injects variables statically at build time.
   * Dynamic access like process.env[name] will ALWAYS return undefined in the browser.
   */
  const staticUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const staticKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  
  // Fallback for non-standard environments (like AI Studio preview or if window injection is used)
  const getFallbackVar = (name: string): string => {
    if (!isBrowser) return '';
    const win = window as any;
    return win.process?.env?.[name] || win[name] || '';
  };

  const url = (staticUrl || getFallbackVar('NEXT_PUBLIC_SUPABASE_URL')).trim();
  const key = (staticKey || getFallbackVar('NEXT_PUBLIC_SUPABASE_ANON_KEY')).trim();
  
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
  // Valid URL and a key that looks like a Supabase Anon Key (long JWT)
  return !!(url && url.startsWith('https://') && key && key.length > 30);
};

export const getSupabaseClient = (): SupabaseClient => {
  const globalClient = getGlobalSupabase();
  if (globalClient) return globalClient;
  
  if (supabaseInstance) return supabaseInstance;

  const { url, key } = getCredentials();
  
  // If not configured, we return a dummy client to prevent crashes, but isSupabaseConfigured() will catch it
  if (!isSupabaseConfigured()) {
    console.warn("⚠️ Infrastructure handshake incomplete: Missing Supabase credentials.");
    return createClient('https://placeholder-node.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-key');
  }
  
  const isServer = typeof window === 'undefined';
  
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
  if (!isSupabaseConfigured()) return createClient('https://placeholder.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-key');

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
