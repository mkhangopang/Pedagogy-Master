
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole } from '../types';
import { ADMIN_EMAILS } from '../constants';

const getEnv = (key: string): string => {
  const sanitize = (v: any) => {
    if (!v) return '';
    const s = String(v).trim();
    if (s === 'undefined' || s === 'null' || s === '[object Object]') return '';
    return s;
  };

  if (key === 'NEXT_PUBLIC_SUPABASE_URL' && process.env.NEXT_PUBLIC_SUPABASE_URL) return sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (typeof window !== 'undefined') {
    const win = window as any;
    const val = 
      win.process?.env?.[key] || 
      win[key] || 
      win.env?.[key] || 
      (import.meta as any).env?.[key] || 
      (typeof process !== 'undefined' ? (process.env as any)[key] : '') ||
      '';
    
    return sanitize(val);
  }
  
  try {
    return typeof process !== 'undefined' ? sanitize((process.env as any)[key]) : '';
  } catch {
    return '';
  }
};

export const isSupabaseConfigured = (): boolean => {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return !!url && url.length > 10 && !!key && key.length > 10;
};

let cachedClient: SupabaseClient | null = null;

const getClient = (): SupabaseClient => {
  if (cachedClient) return cachedClient;

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!url || !anonKey || url.includes('placeholder')) {
    return createClient('https://placeholder-url.supabase.co', 'placeholder-key');
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'edunexus-auth-token',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    }
  });

  return cachedClient;
};

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
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) return null;
  return user;
}

export function isAppAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase());
}

export async function getOrCreateProfile(userId: string, email?: string) {
  // Use maybeSingle to avoid throwing errors when profile doesn't exist yet
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('📡 [Supabase] Profile lookup failed:', error.message);
    return null;
  }

  if (!profile) {
    console.log('📡 [Supabase] Profile missing, synthesizing new educator record...');
    const isAdminUser = isAppAdmin(email);
    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email: email || '',
        name: email?.split('@')[0] || 'Educator',
        role: isAdminUser ? UserRole.APP_ADMIN : 'teacher',
        plan: isAdminUser ? 'enterprise' : 'free',
        queries_used: 0,
        queries_limit: isAdminUser ? 999999 : 30
      })
      .select()
      .maybeSingle();

    if (insertError) {
      console.error('📡 [Supabase] Profile creation failed:', insertError.message);
      return null;
    }
    return newProfile;
  }

  return profile;
}

export const getSupabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected', message: string }> => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Credentials missing in environment.' };
  }
  try {
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError) return { status: 'disconnected', message: `Auth node unreachable.` };
    return { 
      status: 'connected', 
      message: session ? 'Cloud Node Online (Authenticated)' : 'Cloud Node Online (Guest)' 
    };
  } catch (err: any) {
    return { status: 'disconnected', message: 'Fatal connection failure' };
  }
};

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  return createClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );
};
