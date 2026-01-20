import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

// Internal state management
let supabaseInstance: SupabaseClient | null = null;
let currentConfigFingerprint: string | null = null;
let runtimeConfig: { url: string; key: string } | null = null;

/**
 * SET RUNTIME CONFIG
 * Allows the bootloader to inject credentials fetched via the scavenger bridge.
 */
export const setRuntimeConfig = (url: string, key: string) => {
  if (url && key) {
    console.log('📡 [Infra] Injecting runtime credentials via Scavenger Bridge.');
    runtimeConfig = { url, key };
    supabaseInstance = null; // Force reset
  }
};

/**
 * MASTER ENVIRONMENT RESOLVER (v11.0)
 * Deep-scans build-time, runtime, and injected sources.
 */
export const getCredentials = () => {
  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : {};

  // Hierarchy: 1. Runtime Config -> 2. Build process.env -> 3. Global window
  const url = (
    runtimeConfig?.url ||
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    win.NEXT_PUBLIC_SUPABASE_URL || 
    win.SUPABASE_URL || 
    win.process?.env?.NEXT_PUBLIC_SUPABASE_URL || 
    ''
  ).trim();

  const key = (
    runtimeConfig?.key ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    win.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    win.SUPABASE_ANON_KEY || 
    win.process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    ''
  ).trim();

  return { url, key };
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  return !!(url && key && url.includes('supabase.co') && key.length > 20);
};

/**
 * Singleton factory for Supabase Client
 */
export const getSupabaseClient = (): SupabaseClient => {
  const { url, key } = getCredentials();
  const fingerprint = `${url}-${key}`;

  if (supabaseInstance && currentConfigFingerprint !== fingerprint && isSupabaseConfigured()) {
    supabaseInstance = null;
  }

  if (supabaseInstance) return supabaseInstance;

  const finalUrl = isSupabaseConfigured() ? url : 'https://pending-bridge.supabase.co';
  const finalKey = isSupabaseConfigured() ? key : 'placeholder-key-required-for-boot-cycle-32-chars-min';
  
  currentConfigFingerprint = fingerprint;

  supabaseInstance = createClient(finalUrl, finalKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  return supabaseInstance;
};

export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const client = getSupabaseClient() as any;
    const val = client[prop];
    if (typeof val === 'function') return val.bind(client);
    return val;
  }
});

/**
 * ROOT AUTHORITY CHECK
 * mkgopang@gmail.com is hard-coded as the master admin.
 */
export function isAppAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  const ROOT_ADMINS = ['mkgopang@gmail.com', 'admin@edunexus.ai', ...ADMIN_EMAILS].map(e => e.toLowerCase().trim());
  return ROOT_ADMINS.includes(cleanEmail);
}

export async function getOrCreateProfile(userId: string, email?: string) {
  if (!isSupabaseConfigured()) return null;
  const isAdminUser = isAppAdmin(email);

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      if (isAdminUser && (profile.role !== UserRole.APP_ADMIN || profile.queries_limit < 9999)) {
         await supabase.from('profiles').update({ 
           role: UserRole.APP_ADMIN, 
           plan: SubscriptionPlan.ENTERPRISE,
           queries_limit: 999999
         }).eq('id', userId);
      }
      return profile;
    }

    const { data: newProfile, error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email || '',
        name: email?.split('@')[0] || 'Educator',
        role: isAdminUser ? UserRole.APP_ADMIN : UserRole.TEACHER,
        plan: isAdminUser ? SubscriptionPlan.ENTERPRISE : SubscriptionPlan.FREE,
        queries_used: 0,
        queries_limit: isAdminUser ? 999999 : 30
      }, { onConflict: 'id' })
      .select()
      .single();

    if (upsertError) throw upsertError;
    return newProfile;
  } catch (err) {
    console.error("❌ [System] Profile Sync Error:", err);
    return null;
  }
}

export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Credentials pending hydration.' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Neural Node Linked' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Database unreachable' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  const { url, key } = getCredentials();
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}