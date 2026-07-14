import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { checkAdmin } from '../../../lib/auth/user-role';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseServer = getSupabaseServerClient(token);
  const { data: { user } } = await supabaseServer.auth.getUser(token);
  
  if (!user || !await checkAdmin(supabaseServer, user.id)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const tests = [];
  
  try {
    // 1. Supabase Connection & Auth
    const { data: { session }, error: sessionError } = await supabaseServer.auth.getSession();
    tests.push({ 
      name: "Supabase Connection", 
      status: !sessionError ? "pass" : "fail", 
      message: sessionError ? sessionError.message : "Handshake successful" 
    });

    // 2. Storage Bucket Accessibility
    const { data: buckets, error: bucketError } = await supabaseServer.storage.listBuckets();
    const docBucket = buckets?.find(b => b.name === 'documents');
    tests.push({ 
      name: "Storage Access", 
      status: docBucket ? "pass" : "fail", 
      message: docBucket ? "Documents bucket found" : (bucketError ? bucketError.message : "Documents bucket missing")
    });

    // 3. Database Table Permissions
    const { error: dbError } = await supabaseServer.from('documents').select('id').limit(1);
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