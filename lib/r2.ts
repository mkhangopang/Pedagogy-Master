import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'documents';
const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

export const isR2Configured = () => {
  return !!(accountId && accessKeyId && secretAccessKey);
};

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

export async function getObjectText(key: string): Promise<string> {
  if (!r2Client) throw new Error("Cloud infrastructure not linked.");
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    const response = await r2Client.send(command);
    if (!response.Body) return "";
    return await response.Body.transformToString() || "";
  } catch (e) {
    console.error(`[R2 Fetch Error] ${key}:`, e);
    return "";
  }
}

/**
 * Fetches raw binary data from R2 as a Buffer for multimodal synthesis.
 */
export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  if (!r2Client) throw new Error("Cloud infrastructure node unreachable.");
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    const response = await r2Client.send(command);
    if (!response.Body) return null;
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (e) {
    console.error(`[R2 Binary Error] ${key}:`, e);
    return null;
  }
}

export const getR2PublicUrl = (filePath: string): string | null => {
  if (!R2_PUBLIC_BASE_URL) return null;
  const baseUrl = R2_PUBLIC_BASE_URL.endsWith('/') ? R2_PUBLIC_BASE_URL : `${R2_PUBLIC_BASE_URL}/`;
  return `${baseUrl}${filePath}`;
};