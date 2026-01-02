import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check for both existence and basic format validity
export const isSupabaseConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http')
);

/**
 * Global Supabase instance. 
 * Initialized safely to prevent "Url is required" runtime errors.
 */
export const supabase: SupabaseClient = isSupabaseConfigured 
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : (null as any);

if (!isSupabaseConfigured) {
  console.warn("Pedagogy Master: Supabase credentials missing. Cloud persistence disabled.");
}

/**
 * Diagnostic health check for Supabase infrastructure.
 */
export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return { status: 'disconnected', message: 'Credentials missing in environment' };
  }
  
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        return { status: 'error', message: 'Database schema not initialized (Profiles table missing)' };
      }
      return { status: 'error', message: error.message };
    }
    
    return { status: 'connected', message: 'All systems operational' };
  } catch (err: any) {
    return { status: 'error', message: 'Cloud connection timeout or network failure' };
  }
};

/**
 * Privileged client for internal API routes (Service Role).
 */
export const createPrivilegedClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Infrastructure configuration missing (Service Role Key).');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};