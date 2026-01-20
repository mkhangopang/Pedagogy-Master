import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS } from '../constants';

// Internal state management for the neural data plane
let supabaseInstance: SupabaseClient | null = null;
let currentConfigFingerprint: string | null = null;

/**
 * MASTER ENVIRONMENT RESOLVER (v9.0)
 * Performs a deep scan of the runtime for production credentials.
 */
export const getCredentials = () => {
  const isBrowser = typeof window !== 'undefined';
  const win = isBrowser ? (window as any) : {};

  // Aggressively search all potential key-value pairs in the process and window roots
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    win.NEXT_PUBLIC_SUPABASE_URL || 
    win.SUPABASE_URL || 
    win.process?.env?.NEXT_PUBLIC_SUPABASE_URL || 
    ''
  ).trim();

  const key = (
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
  // Valid if keys exist, contain standard Supabase markers, and have sufficient length
  return !!(url && key && url.includes('supabase.co') && key.length > 20);
};

/**
 * GET SUPABASE CLIENT
 * Singleton factory with automatic "Hot-Reload" support for late environment hydration.
 */
export const getSupabaseClient = (): SupabaseClient => {
  const { url, key } = getCredentials();
  const fingerprint = `${url}-${key}`;

  // RESET LOGIC: If we have a dummy client but real keys just arrived, purge and rebuild.
  if (supabaseInstance && currentConfigFingerprint !== fingerprint && isSupabaseConfigured()) {
    console.log('🔄 [Infra] Environment variables detected. Synchronizing neural node...');
    supabaseInstance = null;
  }

  if (supabaseInstance) return supabaseInstance;

  // Use temporary placeholders to prevent the SDK from throwing 'Invalid URL' during boot
  const finalUrl = isSupabaseConfigured() ? url : 'https://pending-node.supabase.co';
  const finalKey = isSupabaseConfigured() ? key : 'placeholder-node-initialization-key-32-chars';
  
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
 * Ensures all components (Auth, DB, Storage) always use the most recent, valid client.
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
 * Ensures mkgopang@gmail.com is recognized as the Root Authority in all logic.
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
      // Automatic privilege escalation for Root Admin email
      if (isAdminUser && (profile.role !== UserRole.APP_ADMIN || profile.queries_limit < 9999)) {
         console.log('⚡ [Admin] Syncing master authority for root email.');
         await supabase.from('profiles').update({ 
           role: UserRole.APP_ADMIN, 
           plan: SubscriptionPlan.ENTERPRISE,
           queries_limit: 999999
         }).eq('id', userId);
      }
      return profile;
    }

    // Provision new Root profile if missing
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
    console.error("❌ [Auth Node] Profile sync failure:", err);
    return null;
  }
}

export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Environment keys pending hydration.' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Cloud Data Plane: Linked' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Supabase unreachable' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  const { url, key } = getCredentials();
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}