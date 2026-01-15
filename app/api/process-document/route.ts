import { NextResponse } from 'next/server';
/** 
 * DEPRECATED: Folder logic moved to /api/docs/upload for unified handling. 
 */
export async function GET() { return NextResponse.json({ error: "Deprecated." }, { status: 410 }); }
export async function POST() { return NextResponse.json({ error: "Deprecated." }, { status: 410 }); }
