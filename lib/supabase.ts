
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Fallback to empty string if process.env is not yet available during hoisting
const getEnv = (key: string) => {
  if (typeof window !== 'undefined' && (window as any).process?.env) {
    const val = (window as any).process.env[key];
    if (val) return val;
  }
  try {
    return typeof process !== 'undefined' ? process.env[key] || '' : '';
  } catch {
    return '';
  }
};

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = (): boolean => {
  return (
    !!supabaseUrl && 
    !!supabaseAnonKey && 
    supabaseUrl !== 'https://placeholder-project.supabase.co' &&
    supabaseUrl.startsWith('http')
  );
};

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  }
);

export const getSupabaseServerClient = (token: string): SupabaseClient => {
  return createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  );
};

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) {
    return { status: 'disconnected', message: 'Credentials missing from environment.' };
  }

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 3500)
    );

    const queryPromise = supabase.from('profiles').select('id').limit(1);

    const { error } = (await Promise.race([queryPromise, timeoutPromise])) as any;
    
    if (error) {
      if (error.code === '42P01') {
        return { 
          status: 'error', 
          message: 'Schema missing. Open Brain Control to deploy SQL patch.' 
        };
      }
      return { status: 'error', message: `Database error [${error.code}]` };
    }

    return { status: 'connected', message: 'Infrastructure Operational' };
  } catch (err: any) {
    return { 
      status: 'error', 
      message: err.message === 'Connection timeout' ? 'Cloud node unreachable' : 'Handshake failure'
    };
  }
};
