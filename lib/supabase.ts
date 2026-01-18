import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole } from '../types';
import { ADMIN_EMAILS } from '../constants';

/**
 * DYNAMIC ENV RESOLUTION
 * Resolves keys from all possible scopes (Next.js, Vercel, Window Handshake).
 * This ensures that variables set in Vercel UI are detected even if the static 
 * Next.js bundling step was bypassed or had naming mismatches.
 */
const getEnv = (key: string): string => {
  const sanitize = (val: any) => (val && val !== 'undefined' && val !== 'null') ? String(val).trim() : '';
  
  if (typeof window !== 'undefined') {
    const win = window as any;
    // Prioritize namespaced keys from the index.tsx handshake
    const found = sanitize(process.env[key]) || 
                  sanitize(process.env[`NEXT_PUBLIC_${key}`]) ||
                  sanitize(win.process?.env?.[key]) ||
                  sanitize(win.process?.env?.[`NEXT_PUBLIC_${key}`]) ||
                  sanitize(win[key]) ||
                  sanitize(win[`NEXT_PUBLIC_${key}`]);
    if (found) return found;
  }
  
  return sanitize(process.env[key]) || sanitize(process.env[`NEXT_PUBLIC_${key}`]) || '';
};

export const isSupabaseConfigured = (): boolean => {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_ANON_KEY');
  return url.length > 10 && key.length > 10 && !url.includes('placeholder');
};

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';

const getClient = (): SupabaseClient => {
  const url = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');

  // Return existing client if config hasn't changed
  if (cachedClient && url === cachedUrl && url !== '') return cachedClient;

  if (!url || !anonKey || url.includes('placeholder')) {
    return createClient('https://invalid-node-fallback.supabase.co', 'invalid-key');
  }

  cachedUrl = url;
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

// Proxy allows the app to import 'supabase' once, but dynamically swap the 
// underlying client if environment variables arrive late (e.g., via Handshake).
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profile) return profile;

    const isAdminUser = isAppAdmin(email);
    const { data: newProfile } = await supabase
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

    return newProfile;
  } catch (err) {
    console.error("Profile synchronization failure:", err);
    return null;
  }
}

/**
 * SUPABASE HEALTH MONITOR
 * Uses an Auth session check instead of a table query to avoid RLS blockages 
 * during the initial boot sequence.
 */
export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Environment keys not detected.' };
  }
  try {
    // getSession is local-first and doesn't require table permissions
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    return { status: 'connected', message: 'Cloud Node Operational' };
  } catch (err: any) {
    return { status: 'disconnected', message: err.message || 'Connection failure' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  return createClient(
    getEnv('SUPABASE_URL'),
    getEnv('SUPABASE_ANON_KEY'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}