
import { NextRequest } from 'next/server';
import { supabase } from '../supabase';

/**
 * B2B API GUARD (v1.0)
 * Validates X-API-Key for institutional partners (Noon, Moodle, etc.)
 */
export async function validateApiKey(req: NextRequest) {
  const apiKey = req.headers.get('X-API-Key');
  
  if (!apiKey) {
    return { authorized: false, error: 'Missing X-API-Key header' };
  }

  // For bootstrap phase, we check against a specific metadata field in profiles
  // or a dedicated api_keys table. 
  // SECURITY: In production, hash these keys.
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, plan, role, name')
    .eq('tenant_config->>api_key', apiKey)
    .single();

  if (error || !profile) {
    return { authorized: false, error: 'Invalid or revoked API Key' };
  }

  const isEnterprise = profile.plan === 'enterprise' || profile.role === 'app_admin';
  
  if (!isEnterprise) {
    return { authorized: false, error: 'API access requires an Institutional Node (Enterprise Plan)' };
  }

  return { authorized: true, user: profile };
}
