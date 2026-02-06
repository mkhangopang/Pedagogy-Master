
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseAdminClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../../lib/r2';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * NEURAL NODE PURGE PROTOCOL (v10.2)
 * FOUNDER OVERRIDE: Absolute deletion authority for system maintenance.
 * GHOST MITIGATION: Uses Admin Client (Service Role) for both lookup and removal.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    // 1. Authenticate the requester
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Doc ID required' }, { status: 400 });

    // 2. Escalate to Admin Client immediately for robust lookup
    const adminSupabase = getSupabaseAdminClient();
    
    // Check if requester is authorized Admin
    const adminString = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
    const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const userEmail = (user.email || '').toLowerCase().trim();
    
    const { data: profile } = await adminSupabase.from('profiles').select('role').eq('id', user.id).single();
    const isAppAdmin = profile?.role === 'app_admin' || adminEmails.includes(userEmail);

    // Fetch document metadata using Admin client to bypass RLS for the check
    const { data: doc, error: fetchError } = await adminSupabase.from('documents').select('*').eq('id', id).maybeSingle();
    
    if (!doc) {
      if (isAppAdmin) {
        return NextResponse.json({ success: true, message: 'Ghost node already purged from DB.' });
      }
      return NextResponse.json({ error: 'Node not found or already purged.' }, { status: 404 });
    }

    const isOwner = doc.user_id === user.id;
    const isFailedNode = doc.status === 'failed';

    // Permission Logic: Only Founder can delete healthy nodes. Users can only delete their own failed nodes.
    if (!isAppAdmin && !(isOwner && isFailedNode)) {
      return NextResponse.json({ 
        error: `ACCESS DENIED: Node purge requires Founder privileges for healthy assets.` 
      }, { status: 403 });
    }

    // 3. Physical scrubbing (Cloudflare R2)
    if (doc.file_path && r2Client) {
      try {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: doc.file_path
        }));
      } catch (err) {
        console.warn("R2 Purge Warning (Object might not exist):", err);
      }
    }

    // 4. Scorch Earth Database Cleanup
    // We clean dependent tables first to avoid foreign key violations
    await adminSupabase.from('document_chunks').delete().eq('document_id', id);
    await adminSupabase.from('slo_database').delete().eq('document_id', id);
    
    // Final document record deletion
    const { error: deleteError } = await adminSupabase.from('documents').delete().eq('id', id);

    if (deleteError) {
      console.error("Database deletion error:", deleteError);
      throw new Error(`DB Purge Failed: ${deleteError.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Node successfully purged from the neural grid.' 
    });
  } catch (error: any) {
    console.error("❌ [Purge Fault]:", error);
    return NextResponse.json({ 
      error: error.message || 'A critical fault occurred during the purge operation.' 
    }, { status: 500 });
  }
}
