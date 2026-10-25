import { NextRequest, NextResponse } from 'next/server';
import { GET as handleCallback } from '../../auth/callback/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleCallback(req);
}
