import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, SubscriptionPlan } from '../types';
import { DEFAULT_MASTER_PROMPT } from '../constants';

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
  
  const isServer = typeof window === 'undefined';
  
  supabaseInstance = createClient(url, key, {
    auth: { 
      persistSession: !isServer, 
      autoRefreshToken: !isServer, 
      detectSessionInUrl: !isServer, 
      flowType: 'pkce' 
    },
  });
  return supabaseInstance;
};

export const getSupabaseServerClient = (token?: string): SupabaseClient => {
  const { url, key } = getCredentials();
  if (!isSupabaseConfigured()) return createClient('https://placeholder.supabase.co', 'placeholder-key');

  const options: any = {
    auth: { 
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
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
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  }
});

export async function getOrCreateProfile(userId: string, email?: string) {
  if (!isSupabaseConfigured()) return null;
  
  // SECURITY: Get admins from ENV instead of constants file
  const adminString = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
  const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdminUser = email && adminEmails.includes(email.toLowerCase());

  try {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (profile) return profile;

    const { data: newProfile, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email || '',
        role: isAdminUser ? 'app_admin' : 'teacher',
        plan: isAdminUser ? 'enterprise' : 'free',
        queries_limit: isAdminUser ? 999999 : 30,
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
  if (!isSupabaseConfigured()) return { status: 'disconnected', message: 'Offline' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    return { status: 'connected', message: 'Active' };
  } catch (err: any) {
    return { status: 'disconnected', message: 'Offline' };
  }
};