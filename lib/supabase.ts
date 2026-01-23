import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { ADMIN_EMAILS, DEFAULT_MASTER_PROMPT } from '../constants';

let supabaseInstance: SupabaseClient | null = null;

export const getCredentials = () => {
  const isServer = typeof window === 'undefined';
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || (!isServer ? (window as any).NEXT_PUBLIC_SUPABASE_URL : '') || '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || (!isServer ? (window as any).NEXT_PUBLIC_SUPABASE_ANON_KEY : '') || '').trim();
  return { url, key };
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getCredentials();
  return !!(url && url.startsWith('https://') && key && key.length > 20);
};

export const getSupabaseClient = (): SupabaseClient => {
  if (supabaseInstance) return supabaseInstance;
  const { url, key } = getCredentials();
  if (!isSupabaseConfigured()) return createClient('https://placeholder.supabase.co', 'placeholder-key');
  
  supabaseInstance = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return supabaseInstance;
};

// Add comment above each fix
/**
 * SERVER-SIDE CLIENT FACTORY
 * Creates a dedicated client for API routes, using the user's JWT for RLS when provided.
 */
export const getSupabaseServerClient = (token?: string): SupabaseClient => {
  const { url, key } = getCredentials();
  if (!isSupabaseConfigured()) return createClient('https://placeholder.supabase.co', 'placeholder-key');

  const options: any = {
    auth: { persistSession: false },
  };

  if (token) {
    options.global = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  return createClient(url, key, options);
};

export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const client = getSupabaseClient() as any;
    return typeof client[prop] === 'function' ? client[prop].bind(client) : client[prop];
  }
});

/**
 * IP PROTECTION: Fetches the 'Recipe' from the DB. 
 * If the DB is compromised or empty, it uses a generic fallback.
 */
export async function getActiveNeuralLogic() {
  try {
    const { data } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.master_prompt || DEFAULT_MASTER_PROMPT;
  } catch (e) {
    return DEFAULT_MASTER_PROMPT;
  }
}

export async function getOrCreateProfile(userId: string, email?: string) {
  if (!isSupabaseConfigured()) return null;
  const isAdminUser = email && ADMIN_EMAILS.includes(email.toLowerCase());

  try {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (profile) return profile;

    // Default registration logic
    const { data: newProfile, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email || '',
        role: isAdminUser ? 'app_admin' : 'teacher',
        plan: isAdminUser ? 'enterprise' : 'free',
        queries_limit: isAdminUser ? 999999 : 30,
        // Bootstrapping: Set default white-label config
        tenant_config: { primary_color: '#4f46e5', brand_name: 'EduNexus AI' }
      }, { onConflict: 'id' })
      .select().single();

    if (error) throw error;
    return newProfile;
  } catch (err) {
    console.error("Profile sync fail:", err);
    return null;
  }
}

export const getSupabaseHealth = async () => {
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Node initializing...' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Active' };
  } catch (err: any) {
    return { status: 'disconnected', message: 'Offline' };
  }
};