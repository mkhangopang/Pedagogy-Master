import { NextRequest, NextResponse } from 'next/server';
import { supabase, createPrivilegedClient } from '../../../lib/supabase';

export async function GET(req: NextRequest) {
  const tests = [];
  
  try {
    // 1. Auth Test
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    
    if (token) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      tests.push({ name: "Supabase Auth", status: !authError && user ? "pass" : "fail", details: authError?.message });
    } else {
      tests.push({ name: "Supabase Auth", status: "warning", message: "No token provided for test" });
    }

    // 2. Storage Access Test
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    const hasDocuments = buckets?.some(b => b.name === 'documents');
    tests.push({ 
      name: "Storage Access", 
      status: hasDocuments ? "pass" : "fail", 
      message: hasDocuments ? "Bucket 'documents' exists" : "Bucket 'documents' missing in Supabase" 
    });

    // 3. Database Integrity
    const { error: dbError } = await supabase.from('documents').select('id').limit(1);
    tests.push({ 
      name: "Database Insert Capability", 
      status: !dbError || dbError.code !== '42P01' ? "pass" : "fail",
      message: dbError ? `DB Error: ${dbError.message}` : "Ready for records"
    });

    const overall = tests.every(t => t.status === "pass") ? "success" : "partial";

    return NextResponse.json({ tests, overall, timestamp: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, overall: "error" }, { status: 500 });
  }
}
