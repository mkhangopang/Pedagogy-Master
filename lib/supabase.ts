
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

const isConfigured = 
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!isConfigured && typeof window !== 'undefined') {
  console.warn("Supabase is not configured. Redirecting to configuration check.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const checkSupabaseConfig = () => !!isConfigured;
