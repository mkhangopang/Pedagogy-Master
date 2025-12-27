
import { createClient } from '@supabase/supabase-js';

// Support both NEXT_PUBLIC and standard environment variable names
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder';

// A more robust check: is it NOT the placeholder and does it look like a real URL?
export const isSupabaseConfigured = 
  supabaseUrl !== 'https://placeholder.supabase.co' && 
  supabaseUrl.includes('supabase.co') &&
  supabaseAnonKey !== 'placeholder';

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.warn("Pedagogy Master: Environment variables NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY are missing.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const checkSupabaseConfig = () => isSupabaseConfigured;
