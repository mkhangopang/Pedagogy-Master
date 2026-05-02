/**
 * AI STATUS — Synthesizer Grid Health Dashboard
 *
 * Returns the health and performance state of ALL registered AI providers.
 * Used by the admin dashboard to show which models are active, saturated, or disabled.
 *
 * GET /api/ai-status
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSynthesizer } from '../../../lib/ai/synthesizer-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const health = getSynthesizer().getProviderStatus();

    const summary = {
      total: health.length,
      active: health.filter(p => p.status === 'active').length,
      saturated: health.filter(p => p.status === 'saturated').length,
      disabled: health.filter(p => p.status === 'disabled').length,
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      providers: health,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'reset') {
      getSynthesizer().realignGrid();
      return NextResponse.json({ success: true, message: 'Reset all providers' });
    }

    return NextResponse.json({ error: 'Unknown action. Use: reset' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}