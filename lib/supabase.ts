
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

const NEXT_PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const NEXT_PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const SYNC_TIMEOUT = 12000; // Increased to 12s for institutional reliability

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

export const supabase = getSupabaseClient();

export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/**
 * AUTHORITATIVE ADMIN CHECK
 * Strict verification against constants.ts to prevent lockout.
 */
export function isAppAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  return ADMIN_EMAILS.some(e => e.toLowerCase().trim() === cleanEmail);
}

/**
 * Fetches or creates a user profile with a safety timeout and Admin Override.
 */
export async function getOrCreateProfile(userId: string, email?: string) {
  if (!isSupabaseConfigured()) return null;
  
  // IMMEDIATELY identify admin status to prevent "Guest" fallback for developers
  const isAdminUser = isAppAdmin(email);

  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Neural Sync Timeout')), SYNC_TIMEOUT)
  );

  try {
    const profilePromise = (async () => {
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError) {
        console.warn("⚠️ [System] Profile query warning:", fetchError.message);
      }

      // If profile exists, ensure Admin status is synced even if DB record is stale
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

      // Create new profile with derived roles
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

      if (upsertError) {
        console.error("❌ [System] Profile commitment failure:", upsertError.message);
        throw upsertError;
      }
      return newProfile;
    })();

    return await Promise.race([profilePromise, timeoutPromise]);
  } catch (err: any) {
    console.warn(`⚠️ [Neural Handshake] Slow Data Plane: ${err.message}. Using Authoritative Local State.`);
    
    // Return a virtual profile for Admins if DB is unreachable
    if (isAdminUser) {
      return {
        id: userId,
        email: email || '',
        name: email?.split('@')[0] || 'Developer',
        role: UserRole.APP_ADMIN,
        plan: SubscriptionPlan.ENTERPRISE,
        queries_used: 0,
        queries_limit: 999999
      };
    }
    return null;
  }
}

export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Credentials missing in browser environment.' };
  }
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { status: 'connected', message: 'PostgreSQL Data Plane Active' };
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
