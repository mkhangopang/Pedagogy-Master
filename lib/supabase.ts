import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

// Internal singleton state
let supabaseInstance: SupabaseClient | null = null;
let currentConfigFingerprint: string | null = null;

/**
 * MASTER ENVIRONMENT RESOLVER (v12.0)
 * Scans build-time and window globals for Supabase credentials.
 * FIX: Support server-side environment variable resolution.
 */
export const getCredentials = () => {
  const isServer = typeof window === 'undefined';
  
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    (!isServer ? (window as any).NEXT_PUBLIC_SUPABASE_URL : '') || 
    (!isServer ? (window as any).process?.env?.NEXT_PUBLIC_SUPABASE_URL : '') || 
    ''
  ).trim();

  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    (!isServer ? (window as any).NEXT_PUBLIC_SUPABASE_ANON_KEY : '') || 
    (!isServer ? (window as any).process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY : '') || 
    ''
  ).trim();

  return { url, key };
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  return !!(url && key && url.includes('supabase.co') && key.length > 20);
};

/**
 * SUPABASE CLIENT FACTORY
 * Rebuilds the client dynamically if environment variables hydrate late.
 */
export const getSupabaseClient = (): SupabaseClient => {
  const { url, key } = getCredentials();
  const fingerprint = `${url}-${key}`;

  if (supabaseInstance && currentConfigFingerprint !== fingerprint && isSupabaseConfigured()) {
    supabaseInstance = null;
  }

  if (supabaseInstance) return supabaseInstance;

  // Placeholder keys prevent initialization crashes during early boot
  const finalUrl = isSupabaseConfigured() ? url : 'https://initializing.supabase.co';
  const finalKey = isSupabaseConfigured() ? key : 'bootloader-placeholder-key-32-chars-long';
  
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

/**
 * SERVER CLIENT FACTORY
 * Creates a client scoped to a specific user token for RLS.
 * FIX: Added missing export for getSupabaseServerClient as required by API routes.
 */
export const getSupabaseServerClient = (token?: string): SupabaseClient => {
  const { url, key } = getCredentials();
  const finalUrl = isSupabaseConfigured() ? url : 'https://initializing.supabase.co';
  const finalKey = isSupabaseConfigured() ? key : 'bootloader-placeholder-key-32-chars-long';
  
  return createClient(finalUrl, finalKey, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    },
    auth: {
      persistSession: false
    }
  });
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
 * MASTER ADMIN LOCK
 * Primary authority bypass for root institutional access.
 */
export function isAppAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  const ROOT_LIST = ['mkgopang@gmail.com', ...ADMIN_EMAILS].map(e => e.toLowerCase().trim());
  return ROOT_LIST.includes(cleanEmail);
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

    // Escalation Path for Master Admin
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

    // Force create for new admin or teacher
    const { data: newProfile } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email || '',
        name: email?.split('@')[0] || 'Educator',
        role: isAdminUser ? UserRole.APP_ADMIN : UserRole.TEACHER,
        plan: isAdminUser ? SubscriptionPlan.ENTERPRISE : SubscriptionPlan.FREE,
        queries_limit: isAdminUser ? 999999 : 30
      }, { onConflict: 'id' })
      .select()
      .single();

    return newProfile;
  } catch (err) {
    console.error("Profile sync fail:", err);
    return null;
  }
}

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Waiting for environment...' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Neural Node: Active' };
  } catch (err: any) {
    return { status: 'disconnected', message: 'Node unreachable' };
  }
};