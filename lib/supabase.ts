import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

// Internal state management
let supabaseInstance: SupabaseClient | null = null;
let activeConfigKey: string | null = null;

/**
 * ENVIRONMENT RESOLVER
 * Maps Next.js build-time vars or window polyfills.
 */
const getAuthDetails = () => {
  // 1. Literal Check (Mandatory for Next.js build optimization)
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  // 2. Browser Window Check (Fallback for Preview/Studio environments)
  if (typeof window !== 'undefined') {
    const win = window as any;
    const fallbackUrl = (win.NEXT_PUBLIC_SUPABASE_URL || win.SUPABASE_URL || win.process?.env?.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const fallbackKey = (win.NEXT_PUBLIC_SUPABASE_ANON_KEY || win.SUPABASE_ANON_KEY || win.process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    
    const finalUrl = (url && url.length > 10) ? url : fallbackUrl;
    const finalKey = (key && key.length > 20) ? key : fallbackKey;

    return { url: finalUrl, key: finalKey };
  }

  return { url, key };
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getAuthDetails();
  return !!(url && key && url.includes('supabase.co') && key.length > 20);
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
    console.log('🔄 [Infrastructure] Neural handshake upgraded with live keys.');
    supabaseInstance = null;
  }

  if (supabaseInstance) return supabaseInstance;

  // Use valid placeholders to prevent createClient from throwing 'invalid URL' error
  const finalUrl = isSupabaseConfigured() ? url : 'https://placeholder.supabase.co';
  const finalKey = isSupabaseConfigured() ? key : 'placeholder-anon-key-must-be-long-enough-to-be-valid-for-supabase';
  
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
 * Ensures all components access the most recent client instance without crashing.
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

export function isAppAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  return ADMIN_EMAILS.some(e => e.toLowerCase().trim() === cleanEmail);
}

export async function getOrCreateProfile(userId: string, email?: string) {
  if (!isSupabaseConfigured()) return null;
  const isAdminUser = isAppAdmin(email);

  try {
    // 1. Authoritative check (Trigger might have already run)
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

    // 2. Resilient manual upsert (Fallback if trigger lags)
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
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Environment keys missing. Check Vercel vars.' };
  }
  try {
    // Use an anonymous RPC or public-accessible check to verify the link
    const { error } = await supabase.rpc('get_extension_status', { ext: 'vector' });
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Neural Data Plane: Operational' };
  } catch (err: any) {
    console.warn('📡 [Handshake Check] Failed:', err.message);
    return { status: 'disconnected', message: err.message || 'Supabase node unreachable' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  const { url, key } = getAuthDetails();
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}