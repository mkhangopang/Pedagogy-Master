import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../../lib/r2';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * NEURAL NODE PURGE PROTOCOL (v9.0)
 * FOUNDER OVERRIDE: Permit administrative deletion for system maintenance.
 * PRIVACY: Ensures all vector fragments and physical files are scrubbed.
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

    // 1. Authorization: Founders/Admins White-list matching Vercel Env
    const adminString = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
    const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const userEmail = (user.email || '').toLowerCase().trim();
    
    // Fetch document metadata to check ownership OR if it's failed
    const { data: doc } = await anonClient.from('documents').select('*').eq('id', id).single();
    if (!doc) return NextResponse.json({ error: 'Node already purged.' }, { status: 404 });

    const { data: profile } = await anonClient.from('profiles').select('role').eq('id', user.id).single();
    const isAppAdmin = profile?.role === 'app_admin' || adminEmails.includes(userEmail);
    const isOwner = doc.user_id === user.id;
    const isFailedNode = doc.status === 'failed';

    // Permission Logic: Only Founder can delete healthy nodes. Anyone can delete their own failed nodes.
    if (!isAppAdmin && !(isOwner && isFailedNode)) {
      return NextResponse.json({ 
        error: `ACCESS DENIED: Your node (${userEmail}) does not have Founder purge privileges for successful nodes.` 
      }, { status: 403 });
    }

    // 2. Physical scrubbing (R2)
    if (doc.file_path && r2Client) {
      try {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: doc.file_path
        }));
      } catch (err) {
        console.warn("R2 Purge Error (Non-fatal):", err);
      }
    }

    // 3. Scorch Earth Database Cleanup
    // Vector Chunks
    await anonClient.from('document_chunks').delete().eq('document_id', id);
    // Extracted SLOs
    await anonClient.from('slo_database').delete().eq('document_id', id);
    // Document Entry
    const { error: deleteError } = await anonClient.from('documents').delete().eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, message: 'Node purged. Grid integrity restored.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}