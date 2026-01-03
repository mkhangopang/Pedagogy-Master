
import { S3Client } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'documents';

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

if (typeof window === 'undefined') {
  console.log(isR2Configured() 
    ? '✅ Cloudflare R2: Client Initialized' 
    : 'ℹ️ Cloudflare R2: Credentials missing, using Supabase fallback'
  );
}
