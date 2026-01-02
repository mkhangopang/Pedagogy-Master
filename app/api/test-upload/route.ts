import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function GET(req: NextRequest) {
  const tests = [];
  
  try {
    // 1. Auth Health Check
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    tests.push({ 
      name: "Supabase Session", 
      status: !sessionError && session ? "pass" : "fail", 
      message: session ? "Active session found" : "No active session" 
    });

    // 2. Storage Bucket Accessibility
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    const docBucket = buckets?.find(b => b.name === 'documents');
    tests.push({ 
      name: "Storage Access", 
      status: docBucket ? "pass" : "fail", 
      message: docBucket ? "'documents' bucket accessible" : "Bucket not found or permission denied" 
    });

    // 3. Database Table Integrity
    const { error: dbError } = await supabase.from('documents').select('id').limit(1);
    tests.push({ 
      name: "Database Insert Capability", 
      status: !dbError || dbError.code !== '42P01' ? "pass" : "fail",
      message: dbError ? `Error: ${dbError.message}` : "Documents table accessible"
    });

    const overall = tests.every(t => t.status === "pass") ? "success" : "partial_failure";

    return NextResponse.json({ 
      tests, 
      overall, 
      timestamp: new Date().toISOString(),
      instructions: overall === 'success' ? "All systems operational." : "Run SQL initialization in Neural Brain tab."
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, overall: "error" }, { status: 500 });
  }
}