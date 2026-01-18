import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole } from '../types';
import { ADMIN_EMAILS } from '../constants';

/**
 * STATIC ENV RESOLUTION
 * Next.js requires static strings for NEXT_PUBLIC variables to be bundled.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const getEnv = (key: string): string => {
  if (key === 'NEXT_PUBLIC_SUPABASE_URL') return SUPABASE_URL;
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') return SUPABASE_KEY;
  
  if (typeof window !== 'undefined') {
    const win = window as any;
    return win.process?.env?.[key] || win[key] || (process.env as any)[key] || '';
  }
  return (process.env as any)[key] || '';
};

export const isSupabaseConfigured = (): boolean => {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  // Simple check for presence and minimum length to avoid placeholder errors
  return !!url && url.length > 5 && !!key && key.length > 5 && !url.includes('placeholder');
};

let cachedClient: SupabaseClient | null = null;

const getClient = (): SupabaseClient => {
  if (cachedClient) return cachedClient;

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!isSupabaseConfigured()) {
    // Return a dummy client that will fail gracefully rather than crashing the UI
    return createClient('https://invalid.supabase.co', 'invalid');
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  return cachedClient;
};

// Proxy to ensure we always use the latest client state
export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop, receiver) => {
    if (prop === 'then') return undefined;
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    if (typeof value === 'function') return value.bind(client);
    return value;
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
  return ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase());
}

export async function getOrCreateProfile(userId: string, email?: string) {
  if (!isSupabaseConfigured()) return null;
  
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

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

    if (upsertError) console.error("Profile upsert error:", upsertError);
    return newProfile;
  } catch (err) {
    console.error("Profile handshake failed:", err);
    return null;
  }
}

export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Environment keys not detected by client.' };
  }
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    // PGRST116 just means no rows, which is fine for a health check
    if (error && error.code !== 'PGRST116' && error.code !== '42P01') throw error;
    return { status: 'connected', message: 'Cloud Node Operational' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Connection failure' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  return createClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
};