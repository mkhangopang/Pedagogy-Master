import { NextResponse } from 'next/server';
import { getProviderStatus } from '../../../lib/ai/multi-provider-router';

export const dynamic = 'force-dynamic';

export async function GET() {
  const providers = await getProviderStatus();
  return NextResponse.json({
    providers,
    timestamp: new Date().toISOString()
  });
}