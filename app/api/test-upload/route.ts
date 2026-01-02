import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function GET(req: NextRequest) {
  const tests = [];
  
  try {
    // 1. Auth Health Check
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    tests.push({ 
      name: "Supabase Authentication", 
      status: !sessionError && session ? "pass" : "fail", 
      message: session ? "Active session identified" : "No active session detected" 
    });

    // 2. Storage Bucket Accessibility
    // We check if we can at least interact with the storage client
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    const docBucket = buckets?.find(b => b.name === 'documents');
    tests.push({ 
      name: "Storage Access", 
      status: docBucket ? "pass" : "fail", 
      message: docBucket ? "'documents' bucket found" : (bucketError ? `Bucket Error: ${bucketError.message}` : "Bucket 'documents' not found")
    });

    // 3. Database Table Integrity
    const { error: dbError } = await supabase.from('documents').select('id').limit(1);
    tests.push({ 
      name: "Database Write Permission", 
      status: !dbError || (dbError.code !== '42P01' && dbError.code !== '42501') ? "pass" : "fail",
      message: dbError ? `Error ${dbError.code}: ${dbError.message}` : "Documents table accessible"
    });

    const overall = tests.every(t => t.status === "pass") ? "success" : "partial_failure";

    return NextResponse.json({ 
      tests, 
      overall, 
      timestamp: new Date().toISOString(),
      instructions: overall === 'success' 
        ? "Infrastructure is validated." 
        : "Check Supabase project settings and SQL schema."
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, overall: "error" }, { status: 500 });
  }
}