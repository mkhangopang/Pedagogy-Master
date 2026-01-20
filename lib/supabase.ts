import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

// Internal state management
let supabaseInstance: SupabaseClient | null = null;
let activeConfigKey: string | null = null;

/**
 * ULTRA-ROBUST ENVIRONMENT RESOLVER (v5.0)
 * Aggressively scans all possible injection points for Supabase credentials.
 */
const getAuthDetails = () => {
  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : {};

  // 1. Check process.env (Next.js Standard)
  let url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  let key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  // 2. Check window.process.env (Polyfill)
  if (!url || url.length < 10) {
    url = (win.process?.env?.NEXT_PUBLIC_SUPABASE_URL || win.process?.env?.SUPABASE_URL || '').trim();
  }
  if (!key || key.length < 20) {
    key = (win.process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || win.process?.env?.SUPABASE_ANON_KEY || '').trim();
  }

  // 3. Check Global Window (AI Studio/Custom Injection)
  if (!url || url.length < 10) {
    url = (win.NEXT_PUBLIC_SUPABASE_URL || win.SUPABASE_URL || '').trim();
  }
  if (!key || key.length < 20) {
    key = (win.NEXT_PUBLIC_SUPABASE_ANON_KEY || win.SUPABASE_ANON_KEY || '').trim();
  }

  return { url, key };
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getAuthDetails();
  const isValid = !!(url && key && url.includes('supabase.co') && key.length > 20);
  
  if (!isValid && typeof window !== 'undefined') {
    // Silent diagnostic for developer console
    console.debug('📡 [Env Diagnostic] URL:', url ? 'Detected' : 'MISSING', '| Key:', key ? `Len(${key.length})` : 'MISSING');
  }
  
  return isValid;
};

/**
 * GET SUPABASE CLIENT
 * Singleton that re-evaluates if configuration arrives after module load.
 */
export const getSupabaseClient = (): SupabaseClient => {
  const { url, key } = getAuthDetails();
  const currentKey = `${url}-${key}`;

  // Reset if keys were previously missing but are now found
  if (supabaseInstance && activeConfigKey !== currentKey && isSupabaseConfigured()) {
    console.log('🔄 [Infrastructure] Neural handshake upgraded with production keys.');
    supabaseInstance = null;
  }

  if (supabaseInstance) return supabaseInstance;

  // Use valid placeholders to prevent createClient from throwing 'invalid URL' error
  // This ensures the application doesn't crash during the "Handshake" phase
  const finalUrl = isSupabaseConfigured() ? url : 'https://placeholder-node.supabase.co';
  const finalKey = isSupabaseConfigured() ? key : 'placeholder-anon-key-required-for-initial-proxy-boot';
  
  activeConfigKey = currentKey;

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
 * High-availability proxy that ensures all components access the live client.
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
 * AUTH AUTHORITY CHECK
 * Ensures mkgopang@gmail.com is always recognized as the primary admin.
 */
export function isAppAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  const AUTHORITY_EMAILS = [
    'mkgopang@gmail.com', // Primary Email
    ...ADMIN_EMAILS
  ].map(e => e.toLowerCase().trim());
  
  return AUTHORITY_EMAILS.includes(cleanEmail);
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
      if (isAdminUser && profile.role !== UserRole.APP_ADMIN) {
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
    console.error("❌ [Identity Node] Sync Failure:", err);
    return null;
  }
}

export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Credentials missing in runtime.' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Neural Data Plane Active' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Supabase node unreachable' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  const { url, key } = getAuthDetails();
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}