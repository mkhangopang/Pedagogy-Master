import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

// Internal state for lazy singleton
let supabaseInstance: SupabaseClient | null = null;
let isUsingPlaceholder = true;

const getEnvVar = (key: string): string => {
  if (typeof window !== 'undefined') {
    const win = window as any;
    // Aggressive priority resolution for preview environments
    return (
      win.process?.env?.[key] || 
      win.process?.env?.[`NEXT_PUBLIC_${key}`] || 
      process.env[key] || 
      process.env[`NEXT_PUBLIC_${key}`] || 
      win[key] || 
      win[`NEXT_PUBLIC_${key}`] || 
      win.aistudio?.[key] || // Check AI Studio specifics if applicable
      ''
    );
  }
  return process.env[key] || process.env[`NEXT_PUBLIC_${key}`] || '';
};

export const isSupabaseConfigured = (): boolean => {
  const url = getEnvVar('SUPABASE_URL');
  const key = getEnvVar('SUPABASE_ANON_KEY');
  const isValid = url.length > 10 && key.length > 10 && !url.includes('placeholder');
  
  if (!isValid && typeof window !== 'undefined') {
    console.warn(`📡 [System] Handshake stalled: Missing ${url.length <= 10 ? 'URL' : ''} ${key.length <= 10 ? 'Key' : ''}`);
  }
  
  return isValid;
};

/**
 * Lazy singleton getter for Supabase client.
 * CRITICAL FIX: If we are using a placeholder client and real keys become available, 
 * we must invalidate the cache and create a real client.
 */
export const getSupabaseClient = (): SupabaseClient => {
  const url = getEnvVar('SUPABASE_URL');
  const key = getEnvVar('SUPABASE_ANON_KEY');
  const currentlyConfigured = url.length > 10 && key.length > 10 && !url.includes('placeholder');

  // If we have an instance but it was a placeholder and now we have real keys, reset it
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
 * PROXY EXPORT:
 * Instead of a fixed constant, we export a proxy that calls the getter.
 * This ensures that even if a file imports 'supabase' at the top level,
 * it always gets the most up-to-date client initialization.
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
    const client = getSupabaseClient();
    const { data: { user } } = await client.auth.getUser();
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
  const client = getSupabaseClient();

  try {
    const { data: profile } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      if (isAdminUser && profile.role !== UserRole.APP_ADMIN) {
         await client.from('profiles').update({ 
           role: UserRole.APP_ADMIN, 
           plan: SubscriptionPlan.ENTERPRISE 
         }).eq('id', userId);
         profile.role = UserRole.APP_ADMIN;
         profile.plan = SubscriptionPlan.ENTERPRISE;
      }
      return profile;
    }

    const { data: newProfile } = await client
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
    const client = getSupabaseClient();
    const { error } = await client.from('profiles').select('id').limit(1);
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