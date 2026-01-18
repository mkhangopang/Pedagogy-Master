import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole } from '../types';
import { ADMIN_EMAILS } from '../constants';

/**
 * NEXT.JS STATIC ENVIRONMENT RESOLUTION
 * Next.js requires these to be accessed statically (literal string) 
 * so the compiler can inline the values into the client-side bundle.
 */
const NEXT_PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const NEXT_PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Single-instance Supabase client.
 * Using a Proxy can cause issues with internal "this" bindings and React 19's 
 * stricter hydration/serialization checks.
 */
let supabaseInstance: SupabaseClient | null = null;

export const isSupabaseConfigured = (): boolean => {
  return (
    NEXT_PUBLIC_URL.length > 10 && 
    NEXT_PUBLIC_KEY.length > 10 && 
    !NEXT_PUBLIC_URL.includes('placeholder')
  );
};

export const getSupabaseClient = (): SupabaseClient => {
  if (supabaseInstance) return supabaseInstance;

  // Fallback for development/unconfigured states to prevent crashes
  const url = isSupabaseConfigured() ? NEXT_PUBLIC_URL : 'https://waiting-for-deployment.supabase.co';
  const key = isSupabaseConfigured() ? NEXT_PUBLIC_KEY : 'invalid-key';

  supabaseInstance = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  return supabaseInstance;
};

// Export the singleton instance
export const supabase = getSupabaseClient();

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
  return ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase());
}

export async function getOrCreateProfile(userId: string, email?: string) {
  if (!isSupabaseConfigured()) return null;
  
  try {
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (fetchError) {
      console.warn("Profile fetch warning:", fetchError.message);
    }

    if (profile) return profile;

    const isAdminUser = isAppAdmin(email);
    const { data: newProfile, error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email || '',
        name: email?.split('@')[0] || 'Educator',
        role: isAdminUser ? UserRole.APP_ADMIN : 'teacher',
        plan: isAdminUser ? 'enterprise' : 'free',
        queries_used: 0,
        queries_limit: isAdminUser ? 999999 : 30
      })
      .select()
      .single();

    if (upsertError) {
      console.error("Profile synchronization failure:", upsertError);
    }
    return newProfile;
  } catch (err) {
    console.error("Fatal error during profile creation:", err);
    return null;
  }
}

export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Credentials missing in browser scope.' };
  }
  try {
    // getSession is local-first and reliable for a ping without hitting RLS
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    return { status: 'connected', message: 'Cloud Node Operational' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Connection failure' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  return createClient(
    NEXT_PUBLIC_URL,
    NEXT_PUBLIC_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}