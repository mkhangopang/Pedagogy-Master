
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder';

export const isSupabaseConfigured = 
  supabaseUrl !== 'https://placeholder.supabase.co' && 
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey !== 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * HELPER: Upload to Storage Bucket
 * Note: Create a bucket named 'documents' in Supabase dashboard first.
 */
export const uploadFile = async (file: File, bucket: string = 'documents') => {
  if (!isSupabaseConfigured) {
    console.warn("Supabase not configured, skipping storage upload.");
    return null;
  }
  
  const fileExt = file.name.split('.').pop();
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = fileName;

  try {
    const { data, error } = await supabase.storage.from(bucket).upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });
    
    if (error) {
      console.error("Supabase Storage Error:", error.message);
      throw error;
    }
    
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
    return publicUrl;
  } catch (err) {
    console.error("Storage Service Failure:", err);
    throw err;
  }
};

export const deleteFile = async (path: string, bucket: string = 'documents') => {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.error("Storage delete error:", error);
};

export const checkRateLimit = async (userId: string, limit: number = 50) => {
  if (!isSupabaseConfigured) return true;
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  const { count, error } = await supabase
    .from('feedback_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('created_at', oneHourAgo.toISOString());
  if (error) return true;
  return (count || 0) < limit;
};
