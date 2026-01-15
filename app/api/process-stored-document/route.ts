import { NextResponse } from 'next/server';
/** 
 * DEPRECATED: Document processing logic integrated into high-precision indexer.
 */
export async function GET() { return NextResponse.json({ error: "Deprecated." }, { status: 410 }); }
export async function POST() { return NextResponse.json({ error: "Deprecated." }, { status: 410 }); }
