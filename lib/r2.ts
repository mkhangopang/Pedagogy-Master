import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 Client (S3-Compatible)
 * Pointed at the R2 regional endpoint with account-specific credentials.
 */
export const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT || "",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export const BUCKET_NAME = process.env.R2_BUCKET_NAME || "documents";

/**
 * Phase 1: Generates a signed PUT URL for direct browser-to-R2 upload.
 */
export async function getUploadPresignedUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  
  // URL expires in 1 hour
  return await getSignedUrl(r2Client, command, { expiresIn: 3600 });
}

/**
 * Helper: Generates a signed GET URL for secure retrieval.
 */
export async function getDownloadPresignedUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  
  return await getSignedUrl(r2Client, command, { expiresIn: 3600 });
}
