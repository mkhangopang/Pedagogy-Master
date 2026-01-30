import { NextResponse } from 'next/server';
import { getSynthesizer } from '../../../lib/ai/synthesizer-core';

export const dynamic = 'force-dynamic';

export async function GET() {
  const providers = getSynthesizer().getProviderStatus();
  return NextResponse.json({
    providers,
    timestamp: new Date().toISOString()
  });
}