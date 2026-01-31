import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
// Add comment above each fix
// Fix: Added missing Buffer import to resolve "Cannot find name 'Buffer'" error
import { Buffer } from 'buffer';

let r2Instance: S3Client | null = null;

export const isR2Configured = () => {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
};

export const getR2Client = (): S3Client | null => {
  if (r2Instance) return r2Instance;
  if (!isR2Configured()) return null;

  try {
    r2Instance = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    return r2Instance;
  } catch (e) {
    console.error("Failed to initialize R2 Client:", e);
    return null;
  }
};

/**
 * Singleton instance of the R2 client for server-side routes.
 */
export const r2Client = typeof window === 'undefined' ? getR2Client() : null;

export const R2_BUCKET = process.env.R2_BUCKET_NAME || 'documents';
export const R2_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

export async function getObjectText(key: string): Promise<string> {
  const client = getR2Client();
  if (!client) throw new Error("Cloud infrastructure not linked.");
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    const response = await client.send(command);
    if (!response.Body) return "";
    return await response.Body.transformToString() || "";
  } catch (e) {
    console.error(`[R2 Fetch Error] ${key}:`, e);
    return "";
  }
}

export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  const client = getR2Client();
  if (!client) throw new Error("Cloud infrastructure node unreachable.");
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    const response = await client.send(command);
    if (!response.Body) return null;
    const bytes = await response.Body.transformToByteArray();
    // Use native Node.js Buffer
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