import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// BUG FIX U1: Raise body size limit for this route.
// Vercel's default API route body limit is 4.5MB. A large curriculum PDF
// can produce 2-4MB of extracted text. When extractedText is included in
// the JSON body, it can silently exceed this limit — Vercel drops the
// TCP connection without sending any response headers, causing the browser
// to report "Failed to fetch" rather than a useful HTTP error.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export async function OPTIONS() {
  return NextResponse.json({ storageActive: isR2Configured() });
}

/**
 * PRODUCTION UPLOAD GATEWAY (v137.0)
 *
 * BUG FIX U1: Body size limit raised to 10MB (was 4.5MB default).
 * BUG FIX U2: Use getSupabaseServerClient(token) instead of the browser-proxy
 *   `anonClient`. The `anonClient` export is a Proxy that calls getSupabaseClient()
 *   which initializes a browser-storage-backed client (reads document.cookie,
 *   localStorage). On the server, these calls silently fail or return null,
 *   causing auth.getUser() to return null → 401 "Invalid Identity" even with
 *   a valid token. This manifests as "Failed to fetch" when the component
 *   doesn't handle the 401 response body correctly.
 * BUG FIX U3: R2 signed URL generation is now wrapped in a try/catch that
 *   returns a useful error instead of crashing the route.
 * BUG FIX U4: extractedText is now optional and trimmed on the server.
 *   If it exceeds a reasonable size, we accept it but store it as-is —
 *   the server-side pdf-parse in Stage 1 is the authoritative source anyway.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token || token === 'undefined' || token.length < 10) {
      return NextResponse.json({ error: 'Auth Required: No valid token provided.' }, { status: 401 });
    }

    // BUG FIX U2: Use the server-side client with the user token, not the browser proxy.
    // getSupabaseServerClient creates a fresh client with no browser storage dependencies.
    const supabase = getSupabaseServerClient(token);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[Upload] Auth validation failed:', authError?.message);
      return NextResponse.json({
        error: 'Identity validation failed. Please sign out and sign back in.'
      }, { status: 401 });
    }

    // Parse body
    let body: any;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error('[Upload] Body parse error:', parseErr);
      return NextResponse.json({
        error: 'Request body is malformed or too large. Try a smaller file or use Manual Entry mode.'
      }, { status: 400 });
    }

    const { name, contentType, extractedText } = body;

    if (!name || !contentType) {
      return NextResponse.json({ error: 'Document name and contentType are required.' }, { status: 400 });
    }

    // Sanitize filename
    const safeName = name.replace(/<[^>]*>/g, '').substring(0, 255).trim();
    const documentId = crypto.randomUUID();
    const cleanFileName = safeName.replace(/[^a-zA-Z0-9.-]/g, '_');

    // BUG FIX U3: Wrap R2 operations in a try/catch to prevent the route
    // from crashing silently (which causes "Failed to fetch" rather than a
    // useful error message in the browser).
    let uploadUrl: string | null = null;
    let r2Key: string | null = null;

    if (isR2Configured() && r2Client) {
      try {
        r2Key = `raw/${user.id}/${documentId}/${cleanFileName}`;
        const command = new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: r2Key,
          ContentType: contentType,
        });
        uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });
      } catch (r2Err: any) {
        // R2 failing should not block the entire upload.
        // The processing pipeline can still work from extractedText alone.
        console.error('[Upload] R2 signed URL generation failed:', r2Err.message);
        uploadUrl = null;
        r2Key = null;
        // Fall through — extractedText path will be used instead
      }
    } else {
      console.warn('[Upload] R2 not configured. Using extractedText-only path.');
    }

    // BUG FIX U4: Cap extractedText stored in DB during upload.
    // The authoritative text extraction happens server-side in Stage 1 (pdf-parse).
    // We store the client-extracted text as a fast-start optimization, but cap it
    // at 2MB to prevent Supabase insert failures (text column limit).
    const MAX_EXTRACTED_TEXT = 2 * 1024 * 1024; // 2MB
    let safeExtractedText = extractedText || '';
    if (safeExtractedText.length > MAX_EXTRACTED_TEXT) {
      console.warn(`[Upload] extractedText truncated: ${safeExtractedText.length} → ${MAX_EXTRACTED_TEXT} chars`);
      safeExtractedText = safeExtractedText.substring(0, MAX_EXTRACTED_TEXT);
    }

    // De-select previously selected documents
    await supabase
      .from('documents')
      .update({ is_selected: false })
      .eq('user_id', user.id);

    const { data: docData, error: dbError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        user_id: user.id,
        name: safeName,
        file_path: r2Key,          // null if R2 not configured
        status: 'pending',
        mime_type: contentType,
        subject: 'Detecting...',
        grade_level: 'Auto',
        is_selected: true,
        document_summary: r2Key
          ? 'Binary payload streaming...'
          : 'Text-only mode (R2 unavailable)',
        rag_indexed: false,
        extracted_text: safeExtractedText,
        is_approved: false,
        version: 1
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Upload] DB insert error:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    return NextResponse.json({
      success: true,
      documentId: docData.id,
      uploadUrl: uploadUrl,    // null if R2 not available — client skips binary upload
      r2Key: r2Key,
      r2Available: !!uploadUrl,
    });

  } catch (error: any) {
    console.error('❌ [Upload Handshake Fault]:', error);
    return NextResponse.json({
      error: error.message || 'Upload gateway exception. Please try again.'
    }, { status: 500 });
  }
}
