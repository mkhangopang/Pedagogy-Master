import { NextResponse } from 'next/server';
import { getProviderStatus } from '../../../lib/ai/multi-provider-router';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    providers: getProviderStatus(),
    timestamp: new Date().toISOString()
  });
}
