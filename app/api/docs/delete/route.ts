import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../../lib/r2';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * NEURAL NODE PURGE PROTOCOL (v6.0)
 * RESTRICTION: Only App Admins (via Env List) or Enterprise Institutions can purge assets.
 * This ensures that even failed documents are managed by a human administrator.
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

    // 1. Authorization Logic: Plan + Email check
    const { data: profile } = await anonClient
      .from('profiles')
      .select('role, plan, email')
      .eq('id', user.id)
      .single();

    const adminString = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
    const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    
    const isOwnerByEmail = profile?.email && adminEmails.includes(profile.email.toLowerCase());
    const isAppAdmin = profile?.role === 'app_admin' || isOwnerByEmail;
    const isEnterprise = profile?.plan === 'enterprise';

    // PRIVILEGE CHECK: Only Admins/Enterprise/Owner can initiate a purge
    if (!isAppAdmin && !isEnterprise) {
      return NextResponse.json({ 
        error: 'ADMINISTRATIVE PRIVILEGE REQUIRED: Failed curriculum assets can only be purged by an Institutional Admin node.' 
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
    if (doc.storage_type === 'r2' && r2Client) {
      try {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: doc.file_path
        }));
      } catch (err) {
        console.error("R2 Physical Delete Failed:", err);
      }
    }

    // 4. Vector Chunk Deletion
    await anonClient.from('document_chunks').delete().eq('document_id', id);

    // 5. Database record deletion
    const { error: deleteError } = await anonClient
      .from('documents')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, message: 'Neural node purged successfully.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}