import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

// Internal state for lazy singleton
let supabaseInstance: SupabaseClient | null = null;
let isUsingPlaceholder = true;

/**
 * RESOLVE SYSTEM KEYS
 * Next.js requires explicit literal access (e.g. process.env.NEXT_PUBLIC_KEY) 
 * for variables to be bundled into the client-side code. Dynamic property access
 * like process.env[key] will fail on the client.
 */
const getEnvVar = (key: string): string => {
  // 1. Explicit Literal Check (Priority 1 - Bundled Constants)
  if (key === 'SUPABASE_URL') {
    const val = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (val) return val;
  }
  if (key === 'SUPABASE_ANON_KEY') {
    const val = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (val) return val;
  }

  // 2. Runtime Window Check (Priority 2 - Preview/Injected environments)
  if (typeof window !== 'undefined') {
    const win = window as any;
    return (
      win.process?.env?.[key] || 
      win.process?.env?.[`NEXT_PUBLIC_${key}`] || 
      win[key] || 
      win[`NEXT_PUBLIC_${key}`] || 
      win.aistudio?.[key] || 
      ''
    );
  }
  
  return '';
};

export const isSupabaseConfigured = (): boolean => {
  const url = getEnvVar('SUPABASE_URL');
  const key = getEnvVar('SUPABASE_ANON_KEY');
  
  const isValid = (url && url.length > 10 && !url.includes('placeholder')) && 
                  (key && key.length > 10 && !key.includes('placeholder'));
  
  if (!isValid && typeof window !== 'undefined') {
    console.warn(`📡 [System] Handshake stalled: Missing credentials in environment.`);
  }
  
  return !!isValid;
};

/**
 * Lazy singleton getter for Supabase client.
 * Invalidate cache if real keys become available after a placeholder was already created.
 */
export const getSupabaseClient = (): SupabaseClient => {
  const url = getEnvVar('SUPABASE_URL');
  const key = getEnvVar('SUPABASE_ANON_KEY');
  const currentlyConfigured = url.length > 10 && key.length > 10 && !url.includes('placeholder');

  if (supabaseInstance && isUsingPlaceholder && currentlyConfigured) {
    supabaseInstance = null;
  }

  if (supabaseInstance) return supabaseInstance;

  const finalUrl = currentlyConfigured ? url : 'https://placeholder.supabase.co';
  const finalKey = currentlyConfigured ? key : 'placeholder-key';
  
  isUsingPlaceholder = !currentlyConfigured;

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
 * PROXY EXPORT
 * Ensures top-level imports always access the most current client state.
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      if (isAdminUser && profile.role !== UserRole.APP_ADMIN) {
         await supabase.from('profiles').update({ 
           role: UserRole.APP_ADMIN, 
           plan: SubscriptionPlan.ENTERPRISE 
         }).eq('id', userId);
         profile.role = UserRole.APP_ADMIN;
         profile.plan = SubscriptionPlan.ENTERPRISE;
      }
      return profile;
    }

    const { data: newProfile } = await supabase
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

    return newProfile;
  } catch (err) {
    console.error("Profile sync failure:", err);
    return null;
  }
}

export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Infrastructure node missing config.' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'PostgreSQL Data Plane Active' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Connection failure' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  const url = getEnvVar('SUPABASE_URL');
  const key = getEnvVar('SUPABASE_ANON_KEY');
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}