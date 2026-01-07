
import { NextResponse } from 'next/server';
import { getProviderStatus } from '../../../lib/ai/multi-provider-router';

export async function GET() {
  return NextResponse.json({
    providers: getProviderStatus(),
    timestamp: new Date().toISOString()
  });
}
