import { S3Client } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'documents';
const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

/**
 * Validates R2 configuration availability.
 */
export const isR2Configured = () => {
  return !!(accountId && accessKeyId && secretAccessKey);
};

/**
 * Cloudflare R2 S3-Compatible Client
 */
export const r2Client = isR2Configured() 
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    })
  : null;

export const R2_BUCKET = bucketName;
export const R2_PUBLIC_BASE_URL = publicUrl;

/**
 * Generates a public URL for a file stored in R2
 */
export const getR2PublicUrl = (filePath: string): string | null => {
  if (!R2_PUBLIC_BASE_URL) return null;
  const baseUrl = R2_PUBLIC_BASE_URL.endsWith('/') ? R2_PUBLIC_BASE_URL : `${R2_PUBLIC_BASE_URL}/`;
  return `${baseUrl}${filePath}`;
};

if (typeof window === 'undefined') {
  console.log(isR2Configured() 
    ? `✅ Cloudflare R2: Client Initialized (Bucket: ${R2_BUCKET})` 
    : 'ℹ️ Cloudflare R2: Credentials missing, using Supabase fallback'
  );
  if (R2_PUBLIC_BASE_URL) {
    console.log(`🌐 Cloudflare R2: Public URL identified: ${R2_PUBLIC_BASE_URL}`);
  }
}