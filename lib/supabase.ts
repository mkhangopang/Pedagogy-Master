
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

/**
 * Supabase Configuration
 * In production, these are injected via Vercel Environment Variables.
 * We use placeholder strings if the variables are missing to prevent the 
 * createClient constructor from throwing a 'supabaseUrl is required' error.
 */
const supabaseUrl = (window as any).process?.env?.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = (window as any).process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
