import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, UserRole } from '../../types';

export const ADMIN_EMAILS: string[] = [
  'mkgopang@gmail.com',
  process.env.ADMIN_EMAIL,
  process.env.NEXT_PUBLIC_ADMIN_EMAIL
].filter(Boolean).map(e => String(e).toLowerCase().trim());

export function isAdminUser(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === UserRole.APP_ADMIN) return true;
  if (profile.email && ADMIN_EMAILS.includes(profile.email.toLowerCase().trim())) {
    return true;
  }
  return false;
}

export async function checkAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', userId).maybeSingle();
  return isAdminUser(profile as UserProfile);
}

