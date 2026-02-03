
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseAdminClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../../lib/r2';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * NEURAL NODE PURGE PROTOCOL (v10.1)
 * FOUNDER OVERRIDE: Absolute deletion authority for system maintenance.
 * GHOST MITIGATION: Uses Admin Client (Service Role) to bypass RLS when Admin is authenticated.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    // Identify the user making the request
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Doc ID required' }, { status: 400 });

    // 1. Authorization: Founders/Admins White-list matching Vercel Env
    const adminString = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
    const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const userEmail = (user.email || '').toLowerCase().trim();
    
    // Fetch document metadata using anonClient to respect ownership initially
    const { data: doc } = await anonClient.from('documents').select('*').eq('id', id).single();
    
    // Check if requester is authorized Admin
    const { data: profile } = await anonClient.from('profiles').select('role').eq('id', user.id).single();
    const isAppAdmin = profile?.role === 'app_admin' || adminEmails.includes(userEmail);

    // GHOST NODE HANDLING: If doc is already missing from DB, let Admin clear it from UI anyway
    if (!doc && isAppAdmin) {
      return NextResponse.json({ success: true, message: 'Ghost node acknowledged and cleared.' });
    }
    
    if (!doc) {
      return NextResponse.json({ error: 'Node already purged or access denied.' }, { status: 404 });
    }

    const isOwner = doc.user_id === user.id;
    const isFailedNode = doc.status === 'failed';

    // Permission Logic: Only Founder can delete healthy nodes. Users can only delete their own failed nodes.
    if (!isAppAdmin && !(isOwner && isFailedNode)) {
      return NextResponse.json({ 
        error: `ACCESS DENIED: Node purge requires Founder privileges for healthy curriculum assets.` 
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
    // CRITICAL: We use the ADMIN CLIENT to ensure RLS doesn't block the deletion
    const adminSupabase = getSupabaseAdminClient();

    // Clean up related data points
    await adminSupabase.from('document_chunks').delete().eq('document_id', id);
    await adminSupabase.from('slo_database').delete().eq('document_id', id);
    
    // Final document record deletion
    const { error: deleteError } = await adminSupabase.from('documents').delete().eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, message: 'Node purged via Root Auth. Grid integrity restored.' });
  } catch (error: any) {
    console.error("❌ [Purge Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
