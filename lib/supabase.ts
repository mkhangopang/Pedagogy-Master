import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

// Internal state management
let supabaseInstance: SupabaseClient | null = null;
let activeConfigId: string | null = null;

/**
 * RESOLVE SYSTEM KEYS
 * High-reliability resolver for Next.js and Vercel environments.
 */
const getEnvVar = (key: string): string => {
  // 1. Literal compile-time check (Essential for Next.js Client Bundling)
  if (key === 'SUPABASE_URL') {
    const val = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (val && val.length > 10 && !val.includes('placeholder')) return val;
  }
  if (key === 'SUPABASE_ANON_KEY') {
    const val = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (val && val.length > 10 && !val.includes('placeholder')) return val;
  }

  // 2. Runtime Window check (Fallback for injected variables in AI Studio/restricted previews)
  if (typeof window !== 'undefined') {
    const win = window as any;
    const resolved = (
      win.process?.env?.[key] || 
      win.process?.env?.[`NEXT_PUBLIC_${key}`] || 
      win[key] || 
      win[`NEXT_PUBLIC_${key}`] || 
      win.aistudio?.[key] || 
      ''
    );
    if (resolved && resolved.length > 10 && !resolved.includes('placeholder')) return resolved;
  }
  
  return '';
};

export const isSupabaseConfigured = (): boolean => {
  const url = getEnvVar('SUPABASE_URL');
  const key = getEnvVar('SUPABASE_ANON_KEY');
  return !!(url && key && url.includes('supabase.co') && key.length > 20);
};

/**
 * GET SUPABASE CLIENT
 * Lazy singleton with dynamic configuration re-validation.
 * Prevents "Cold Start" errors where placeholders are cached forever.
 */
export const getSupabaseClient = (): SupabaseClient => {
  const url = getEnvVar('SUPABASE_URL');
  const key = getEnvVar('SUPABASE_ANON_KEY');
  const currentConfigId = `${url}-${key}`;

  // RECOVERY LOGIC: If we were using a placeholder and real keys are now available, reset.
  const wasPlaceholder = activeConfigId?.includes('placeholder') || !activeConfigId;
  const isNowReal = url.includes('supabase.co');

  if (supabaseInstance && wasPlaceholder && isNowReal) {
    console.log('📡 [Infrastructure] Handshake synchronized. Switching to production data plane.');
    supabaseInstance = null;
  }

  if (supabaseInstance) return supabaseInstance;

  const finalUrl = url || 'https://placeholder.supabase.co';
  const finalKey = key || 'placeholder-key';
  
  activeConfigId = currentConfigId;

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
 * NEURAL PROXY EXPORT
 * Ensures every call to 'supabase' uses the latest client state.
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
    // 1. Authoritative check
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      // Auto-upgrade role if email is in ADMIN_EMAILS
      if (isAdminUser && profile.role !== UserRole.APP_ADMIN) {
         await supabase.from('profiles').update({ 
           role: UserRole.APP_ADMIN, 
           plan: SubscriptionPlan.ENTERPRISE,
           queries_limit: 999999
         }).eq('id', userId);
      }
      return profile;
    }

    // 2. Fallback creation (Trigger usually handles this, but we're being bulletproof)
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
      })
      .select()
      .single();

    if (upsertError) throw upsertError;
    return newProfile;
  } catch (err) {
    console.error("❌ [Profile Sync] Failure:", err);
    return null;
  }
}

export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Credentials missing in environment.' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'PostgreSQL Data Plane Operational' };
  } catch (err: any) {
    console.warn('📡 [Health Check] Degraded:', err.message);
    return { status: 'disconnected', message: err.message || 'Connection failure' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  const url = getEnvVar('SUPABASE_URL');
  const key = getEnvVar('SUPABASE_ANON_KEY');
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}