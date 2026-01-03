
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../../lib/r2';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Doc ID required' }, { status: 400 });

    // 1. Fetch metadata to determine storage type and path
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // 2. Physical File Deletion
    if (doc.storage_type === 'r2' && r2Client) {
      try {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: doc.file_path
        }));
      } catch (err) {
        console.error("R2 Physical Delete Failed:", err);
      }
    } else {
      // Supabase storage delete
      await supabase.storage.from('documents').remove([doc.file_path]);
    }

    // 3. Database record deletion
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
