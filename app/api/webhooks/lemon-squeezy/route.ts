import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getSupabaseAdminClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLAN_LIMITS: Record<string, { plan: string; queriesLimit: number }> = {
  'pro': { plan: 'pro', queriesLimit: 500 },
  'enterprise': { plan: 'enterprise', queriesLimit: 99999 }
};

function getVariantToPlanMap(): Record<string, string> {
  const map: Record<string, string> = {};
  const proVariant = process.env.LS_VARIANT_PRO?.trim();
  const entVariant = process.env.LS_VARIANT_ENTERPRISE?.trim();
  if (proVariant) map[proVariant] = 'pro';
  if (entVariant) map[entVariant] = 'enterprise';
  return map;
}

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  const trimmedSig = signature.trim();
  if (!secret || !/^[0-9a-f]{64}$/i.test(trimmedSig)) return false;

  const hmac = createHmac('sha256', secret);
  const digest = hmac.update(rawBody).digest();
  const signatureBuffer = Buffer.from(trimmedSig, 'hex');

  if (digest.length !== signatureBuffer.length) return false;

  return timingSafeEqual(digest, signatureBuffer);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('X-Signature') || '';

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventId = String(event?.meta?.event_id ?? '').trim();
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  // Idempotency check
  const { data: existingEvent } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existingEvent) {
    return NextResponse.json({ received: true });
  }

  await supabase
    .from('webhook_events')
    .insert({ event_id: eventId, event_type: event?.meta?.event_name });

  const eventName = event?.meta?.event_name || '';
  const attrs = event?.data?.attributes || {};
  const userEmail = String(attrs.user_email || '').trim().toLowerCase();
  const variantId = String(attrs.variant_id ?? '').trim();
  const variantToPlan = getVariantToPlanMap();
  const planName = variantId ? variantToPlan[variantId] : undefined;
  const planConfig = planName ? PLAN_LIMITS[planName] : null;

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated':
      if (planConfig && userEmail) {
        await supabase
          .from('profiles')
          .update({
            plan: planConfig.plan,
            queries_limit: planConfig.queriesLimit,
            queries_used: 0,
            lemon_squeezy_id: event.data?.id,
            subscription_status: attrs.status || 'active',
            updated_at: new Date().toISOString()
          })
          .eq('email', userEmail);
      }
      break;

    case 'subscription_cancelled':
      if (userEmail) {
        await supabase
          .from('profiles')
          .update({
            subscription_status: 'cancelled',
            subscription_ends_at: attrs.ends_at || attrs.renews_at,
            updated_at: new Date().toISOString()
          })
          .eq('email', userEmail);
      }
      break;

    case 'subscription_expired':
      if (userEmail) {
        await supabase
          .from('profiles')
          .update({
            plan: 'free',
            queries_limit: 20,
            subscription_status: 'expired',
            updated_at: new Date().toISOString()
          })
          .eq('email', userEmail);
      }
      break;
  }

  return NextResponse.json({ received: true });
}
