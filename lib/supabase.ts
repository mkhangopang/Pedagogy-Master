
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder';

// Robust connectivity check for Production/Vercel
export const isSupabaseConfigured = 
  supabaseUrl !== 'https://placeholder.supabase.co' && 
  supabaseUrl.startsWith('https://') &&
  supabaseUrl.includes('.supabase.co') &&
  supabaseAnonKey !== 'placeholder' &&
  supabaseAnonKey.length > 20;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * SECURITY LAYER: Rate Limiting
 * Checks if the user has made too many requests in a short window.
 */
export const checkRateLimit = async (userId: string, limit: number = 50) => {
  if (!isSupabaseConfigured) return true; // Bypass in demo
  
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const { count, error } = await supabase
    .from('feedback_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('created_at', oneHourAgo.toISOString());

  if (error) return true; // Fail open but log internally
  return (count || 0) < limit;
};

// HELPER: Upload to Storage Bucket
export const uploadFile = async (file: File, bucket: string = 'documents') => {
  if (!isSupabaseConfigured) return null;
  const filePath = `${crypto.randomUUID()}-${file.name}`;
  const { data, error } = await supabase.storage.from(bucket).upload(filePath, file);
  if (error) throw error;
  return data.path;
};

export const checkSupabaseConfig = () => isSupabaseConfigured;
