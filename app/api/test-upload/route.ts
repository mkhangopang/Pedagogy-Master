import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function GET(req: NextRequest) {
  const tests = [];
  
  try {
    // 1. Supabase Connection & Auth
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    tests.push({ 
      name: "Supabase Connection", 
      status: !sessionError ? "pass" : "fail", 
      message: sessionError ? sessionError.message : "Handshake successful" 
    });

    // 2. Storage Bucket Accessibility
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    const docBucket = buckets?.find(b => b.name === 'documents');
    tests.push({ 
      name: "Storage Access", 
      status: docBucket ? "pass" : "fail", 
      message: docBucket ? "Documents bucket found" : (bucketError ? bucketError.message : "Documents bucket missing")
    });

    // 3. Database Table Permissions
    const { error: dbError } = await supabase.from('documents').select('id').limit(1);
    tests.push({ 
      name: "Database (Documents Table)", 
      status: !dbError || dbError.code === 'PGRST116' ? "pass" : "fail",
      message: dbError ? `Code ${dbError.code}: ${dbError.message}` : "Table accessible"
    });

    const overall = tests.every(t => t.status === "pass") ? "success" : "failure";

    return NextResponse.json({ 
      tests, 
      overall, 
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, overall: "error" }, { status: 500 });
  }
}