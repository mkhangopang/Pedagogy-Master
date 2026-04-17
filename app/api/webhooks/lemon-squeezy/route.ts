import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { getSupabaseAdminClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLAN_LIMITS: Record<string, { plan: string; queriesLimit: number }> = {
  'pro': { plan: 'pro', queriesLimit: 500 },
  'enterprise': { plan: 'enterprise', queriesLimit: 99999 }
};

const VARIANT_TO_PLAN: Record<string, string> = {
  [process.env.LS_VARIANT_PRO || '']: 'pro',
  [process.env.LS_VARIANT_ENTERPRISE || '']: 'enterprise'
};

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected === signature;
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

  const eventName = event?.meta?.event_name || '';
  const attrs = event?.data?.attributes || {};
  const userEmail = attrs.user_email || '';
  const variantId = String(attrs.variant_id || '');
  const planName = VARIANT_TO_PLAN[variantId];
  const planConfig = planName ? PLAN_LIMITS[planName] : null;

  const supabase = getSupabaseAdminClient();

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
          .eq('email', userEmail.toLowerCase());
      }
      break;

    case 'subscription_cancelled':
      await supabase
        .from('profiles')
        .update({
          subscription_status: 'cancelled',
          subscription_ends_at: attrs.ends_at || attrs.renews_at,
          updated_at: new Date().toISOString()
        })
        .eq('email', userEmail.toLowerCase());
      break;

    case 'subscription_expired':
      await supabase
        .from('profiles')
        .update({
          plan: 'free',
          queries_limit: 20,
          subscription_status: 'expired',
          updated_at: new Date().toISOString()
        })
        .eq('email', userEmail.toLowerCase());
      break;
  }

  return NextResponse.json({ received: true });
}
