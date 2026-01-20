import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

// Internal state management
let supabaseInstance: SupabaseClient | null = null;
let currentConfigFingerprint: string | null = null;

/**
 * MASTER ENVIRONMENT RESOLVER (v8.0)
 * Scans build-time and runtime injection points for Supabase credentials.
 */
export const getCredentials = () => {
  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : {};

  // Priority 1: Standard Next.js Build-time Variables
  let url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  let key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  // Priority 2: Runtime Global Injection (For AI Studio & Special Deployments)
  if (!url) url = (win.NEXT_PUBLIC_SUPABASE_URL || win.SUPABASE_URL || '').trim();
  if (!key) key = (win.NEXT_PUBLIC_SUPABASE_ANON_KEY || win.SUPABASE_ANON_KEY || '').trim();

  // Priority 3: Process Polyfill
  if (!url) url = (win.process?.env?.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!key) key = (win.process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  return { url, key };
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  const isValid = !!(url && key && url.includes('supabase.co') && key.length > 20);
  
  if (!isValid && typeof window !== 'undefined') {
    console.debug('📡 [System] Handshake Diagnostic:', { urlExists: !!url, keyExists: !!key, urlValid: url.includes('supabase.co') });
  }
  
  return isValid;
};

/**
 * GET SUPABASE CLIENT
 * Singleton factory with hot-reloading support.
 */
export const getSupabaseClient = (): SupabaseClient => {
  const { url, key } = getCredentials();
  const fingerprint = `${url}-${key}`;

  if (supabaseInstance && currentConfigFingerprint !== fingerprint && isSupabaseConfigured()) {
    console.log('🔄 [Data Plane] Environment Hydrated. Re-initializing Node.');
    supabaseInstance = null;
  }

  if (supabaseInstance) return supabaseInstance;

  // Use dummy nodes to prevent SDK initialization crashes while waiting for hydration
  const finalUrl = isSupabaseConfigured() ? url : 'https://pending-infrastructure.supabase.co';
  const finalKey = isSupabaseConfigured() ? key : 'placeholder-key-required-for-boot-cycle-minimum-32-chars';
  
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
 * SUPABASE PROXY
 * High-availability proxy for the client instance.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const client = getSupabaseClient() as any;
    const val = client[prop];
    if (typeof val === 'function') return val.bind(client);
    return val;
  }
});

export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/**
 * MASTER ADMIN LOCK
 * Ensures mkgopang@gmail.com always has master authority regardless of DB state.
 */
export function isAppAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  const ROOT_AUTHORITY = ['mkgopang@gmail.com', ...ADMIN_EMAILS].map(e => e.toLowerCase().trim());
  return ROOT_AUTHORITY.includes(cleanEmail);
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
      // Synchronize Admin Privileges for Primary Email
      if (isAdminUser && (profile.role !== UserRole.APP_ADMIN || profile.queries_limit < 9999)) {
         await supabase.from('profiles').update({ 
           role: UserRole.APP_ADMIN, 
           plan: SubscriptionPlan.ENTERPRISE,
           queries_limit: 999999
         }).eq('id', userId);
      }
      return profile;
    }

    // Force create for Root Admin
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
    console.error("❌ [Identity] Sync failure:", err);
    return null;
  }
}

export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Environment keys missing from bundle.' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Neural Data Plane Active' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Supabase unreachable' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  const { url, key } = getCredentials();
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}