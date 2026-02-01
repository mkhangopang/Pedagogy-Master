import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../../lib/r2';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * NEURAL NODE PURGE PROTOCOL (v7.0)
 * RESTRICTION: Only App Admins (via Env List) can purge failed/successful assets.
 * Standard users have zero deletion rights to prevent quota exploitation.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Doc ID required' }, { status: 400 });

    // 1. Authorization: Strict Email White-list Check
    const { data: profile } = await anonClient
      .from('profiles')
      .select('role, plan, email')
      .eq('id', user.id)
      .single();

    // Fix: Case-insensitive trimmed email check
    const adminString = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
    const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const userEmail = (profile?.email || user.email || '').toLowerCase().trim();
    
    const isAppAdmin = profile?.role === 'app_admin' || adminEmails.includes(userEmail);
    const isEnterprise = profile?.plan === 'enterprise';

    // PRIVILEGE CHECK
    if (!isAppAdmin && !isEnterprise) {
      return NextResponse.json({ 
        error: `ACCESS DENIED: Your account (${userEmail}) does not have institutional purge privileges. Only addresses in NEXT_PUBLIC_ADMIN_EMAILS can purge neural nodes.` 
      }, { status: 403 });
    }

    // 2. Fetch document metadata
    const { data: doc, error: fetchError } = await anonClient
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !doc) return NextResponse.json({ error: 'Document not found or unauthorized.' }, { status: 404 });

    // 3. Physical File Deletion (Cloudflare R2)
    if (doc.file_path && r2Client) {
      try {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: doc.file_path
        }));
      } catch (err) {
        console.warn("R2 Purge Partial Fault:", err);
      }
    }

    // 4. Vector Chunk Purge
    await anonClient.from('document_chunks').delete().eq('document_id', id);

    // 5. Artifact & Event Purge (Cleanup related data)
    await anonClient.from('slo_database').delete().eq('document_id', id);

    // 6. Database record deletion
    const { error: deleteError } = await anonClient
      .from('documents')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, message: 'Institutional node purged and audited.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
