import { NextRequest, NextResponse } from 'next/server';

/**
 * NOTE: Most AI logic has been moved to /api/ai for unified task handling.
 * This route is now a placeholder for potential future raw file processing.
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({ message: "Use /api/ai for document processing tasks." }, { status: 200 });
}