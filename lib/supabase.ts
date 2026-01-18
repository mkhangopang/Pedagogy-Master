import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole } from '../types';
import { ADMIN_EMAILS } from '../constants';

/**
 * STATIC ENV RESOLUTION
 * Next.js requires static strings (e.g. process.env.NEXT_PUBLIC_...) to be 
 * explicitly written for the compiler to bundle them into the browser.
 */
const STATIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const STATIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const getEnv = (key: string): string => {
  const sanitize = (val: any) => (val && val !== 'undefined' && val !== 'null') ? String(val).trim() : '';
  
  // 1. Check static Next.js bundled variables first (Most reliable in Production)
  if (key === 'SUPABASE_URL' && STATIC_URL) return STATIC_URL;
  if (key === 'SUPABASE_ANON_KEY' && STATIC_KEY) return STATIC_KEY;
  if (key === 'NEXT_PUBLIC_SUPABASE_URL' && STATIC_URL) return STATIC_URL;
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && STATIC_KEY) return STATIC_KEY;

  // 2. Fallback to Window object (Injected by index.tsx handshake)
  if (typeof window !== 'undefined') {
    const win = window as any;
    const found = sanitize(win.process?.env?.[key]) || 
                  sanitize(win.process?.env?.[`NEXT_PUBLIC_${key}`]) ||
                  sanitize(win[key]) ||
                  sanitize(win[`NEXT_PUBLIC_${key}`]);
    if (found) return found;
  }
  
  // 3. Last resort dynamic process.env (Usually server-side only)
  return sanitize((process.env as any)[key]) || sanitize((process.env as any)[`NEXT_PUBLIC_${key}`]) || '';
};

export const isSupabaseConfigured = (): boolean => {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_ANON_KEY');
  
  // We check for minimal length and "placeholder" strings.
  // In Next.js client, if the user didn't use NEXT_PUBLIC prefix in Vercel, this will be empty.
  return url.length > 5 && key.length > 5 && !url.includes('placeholder') && !url.includes('invalid');
};

let cachedClient: SupabaseClient | null = null;
let lastResolvedUrl = '';

const getClient = (): SupabaseClient => {
  const url = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');

  // Reuse client if config hasn't changed
  if (cachedClient && url === lastResolvedUrl && url !== '') return cachedClient;

  if (!url || !anonKey || url.includes('placeholder') || url === '') {
    // Return a dummy client that doesn't crash but will fail network requests
    // This allows the UI to render while the handshake finishes
    return createClient('https://waiting-for-handshake.supabase.co', 'waiting');
  }

  lastResolvedUrl = url;
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

/**
 * SUPABASE PROXY
 * This ensures that if the environment variables are set LATE (e.g. via 
 * the async handshake in index.tsx), the client will automatically
 * re-initialize with the correct keys on the next property access.
 */
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
    return { status: 'disconnected', message: 'Credentials missing in browser scope.' };
  }
  try {
    // getSession is local-first and reliable for a ping
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