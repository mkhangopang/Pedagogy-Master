import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../../lib/r2';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Doc ID required' }, { status: 400 });

    // 1. Fetch user profile
    const { data: profile } = await anonClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'app_admin';

    // 2. Fetch document metadata
    const query = anonClient.from('documents').select('*').eq('id', id);
    if (!isAdmin) {
      query.eq('user_id', user.id);
    }
    
    const { data: doc, error: fetchError } = await query.single();

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

    // 4. Vector Chunk Deletion (Supabase Vector Store)
    // Cascading delete should handle this if foreign keys are set, but we'll be explicit
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