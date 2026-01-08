
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

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
 * Fetches the text content of an object from R2.
 */
export async function getObjectText(key: string): Promise<string> {
  if (!r2Client) throw new Error("R2 client not configured");
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    const response = await r2Client.send(command);
    
    if (!response.Body) return "";
    
    // transformToString() is available in newer @aws-sdk/client-s3 versions
    // For older environments, we'd use a stream reader
    return await response.Body.transformToString() || "";
  } catch (e) {
    console.error(`[R2 Fetch Error] Failed to get ${key}:`, e);
    return "";
  }
}

/**
 * Generates a public URL for a file stored in R2
 */
export const getR2PublicUrl = (filePath: string): string | null => {
  if (!R2_PUBLIC_BASE_URL) return null;
  const baseUrl = R2_PUBLIC_BASE_URL.endsWith('/') ? R2_PUBLIC_BASE_URL : `${R2_PUBLIC_BASE_URL}/`;
  return `${baseUrl}${filePath}`;
};
