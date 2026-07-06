
import { NextRequest } from 'next/server';
import { supabase } from '../supabase';
import { createHash } from 'crypto';

/**
 * B2B API GUARD (v1.1 - Secure)
 * Validates X-API-Key for institutional partners (Noon, Moodle, etc.)
 */
export async function validateApiKey(req: NextRequest) {
  const apiKey = req.headers.get('X-API-Key');
  
  if (!apiKey) {
    return { authorized: false, error: 'Missing X-API-Key header' };
  }

  // Hash the incoming key
  const hashedKey = createHash('sha256').update(apiKey).digest('hex');

  // Validate against hashed key in tenant_config
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, plan, role, name')
    .eq('tenant_config->>api_key_hash', hashedKey)
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
