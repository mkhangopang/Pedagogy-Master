import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: "Legacy route. Metadata is now handled in lib/upload-handler.ts." }, { status: 410 });
}
