
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

/**
 * Supabase Configuration
 * Variables are retrieved from process.env as per the execution context requirements.
 */
// Fix: Access process.env directly to avoid TypeScript errors on window.process
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === "" || supabaseAnonKey === "") {
  console.warn(
    "Supabase credentials missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables."
  );
}

// Fallback to placeholder to prevent constructor crash, but app will show warning/errors in UI
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder-key'
);
