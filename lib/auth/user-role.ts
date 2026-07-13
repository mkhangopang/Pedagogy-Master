import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, UserRole } from '../../types';

export function isAdminUser(profile: UserProfile | null | undefined): boolean {
  return profile?.role === UserRole.APP_ADMIN;
}

export async function checkAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single();
  return isAdminUser(profile as UserProfile);
}
