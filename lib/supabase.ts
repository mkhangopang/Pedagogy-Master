import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Environment validation for runtime safety
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing. App may malfunction.");
}

// Added missing export to satisfy import in app/page.tsx
/**
 * Export a check for configuration status
 */
export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey && supabaseUrl !== 'https://placeholder.supabase.co';

/**
 * Standard client for browser-side RLS-bound operations.
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

/**
 * Creates a privileged client for server-side routes only.
 * Bypasses RLS to ensure metadata integrity during the upload lifecycle.
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

export type ConnectionStatus = 'disconnected' | 'configured' | 'connected' | 'error';

/**
 * Diagnostic health check for Supabase metadata layer
 */
export const getSupabaseHealth = async (): Promise<{ status: ConnectionStatus; message: string }> => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 'disconnected', message: 'Config missing.' };
  }

  try {
    const { error: profileError } = await supabase.from('profiles').select('id').limit(1);
    
    if (profileError) {
      if (profileError.code === '42P01') return { status: 'error', message: 'Schema missing. Run SQL initialization.' };
      return { status: 'error', message: profileError.message };
    }

    return { status: 'connected', message: 'Infrastructure ready.' };
  } catch (err) {
    return { status: 'error', message: 'Connection failure.' };
  }
};