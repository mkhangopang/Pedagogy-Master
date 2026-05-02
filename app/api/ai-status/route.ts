/**
 * AI STATUS — Unified Orchestrator Health Dashboard
 *
 * Returns the health and performance state of ALL registered AI providers.
 * Used by the admin dashboard (MissionControl.tsx) to show which models
 * are active, blacklisted, or degraded.
 *
 * GET /api/ai-status
 */
import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '../../../lib/ai/unified-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const health = orchestrator.getProviderHealth();

    const summary = {
      total: health.length,
      active: health.filter(p => p.hasKey && !p.blacklisted).length,
      blacklisted: health.filter(p => p.blacklisted).length,
      unconfigured: health.filter(p => !p.hasKey).length,
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
    const { action, providerId } = body;

    if (action === 'reset') {
      orchestrator.resetHealth(providerId);
      return NextResponse.json({ success: true, message: providerId ? `Reset ${providerId}` : 'Reset all providers' });
    }

    return NextResponse.json({ error: 'Unknown action. Use: reset' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
