import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("CRITICAL: Supabase credentials missing from environment.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Creates a privileged client for server-side operations only.
 */
export const createPrivilegedClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing in environment.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

/**
 * Diagnostic health check for Supabase
 */
export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured) return { status: 'disconnected', message: 'Config missing' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') return { status: 'error', message: 'Tables missing' };
      return { status: 'error', message: error.message };
    }
    return { status: 'connected', message: 'Infrastructure ready' };
  } catch (err) {
    return { status: 'error', message: 'Connection failure' };
  }
};