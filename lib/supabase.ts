import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Access variables safely
const getEnv = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http')
);

/**
 * Global Supabase instance.
 */
export const supabase: SupabaseClient = isSupabaseConfigured 
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : (null as any);

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  // Only log if we are reasonably sure they are actually missing
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("PEDAGOGY MASTER: Supabase configuration is missing. Cloud persistence and authentication will be unavailable. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  } else if (!supabaseUrl.startsWith('http')) {
    console.error("PEDAGOGY MASTER: Supabase URL is invalid. It must start with http:// or https://");
  }
}

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return { status: 'disconnected', message: 'Environment keys missing' };
  }
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') return { status: 'error', message: 'Profiles table missing' };
      return { status: 'error', message: error.message };
    }
    return { status: 'connected', message: 'Ready' };
  } catch (err: any) {
    return { status: 'error', message: err.message };
  }
};

export const createPrivilegedClient = () => {
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  
  if (!url || !serviceRoleKey) {
    throw new Error('Service Role configuration missing.');
  }
  return createClient(url, serviceRoleKey);
};