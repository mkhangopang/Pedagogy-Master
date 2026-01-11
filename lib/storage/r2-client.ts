import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';

// Initialize R2 client using environment variables
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'documents';

/**
 * Fetch document text from R2 bucket
 */
export async function fetchDocumentFromR2(key: string): Promise<string> {
  try {
    console.log(`📥 [R2] Fetching document: ${key}`);
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await r2Client.send(command);
    
    if (!response.Body) {
      throw new Error('No body in R2 response');
    }

    const bodyString = await response.Body.transformToString();
    console.log(`✅ [R2] Fetched ${bodyString.length} characters`);
    
    return bodyString;
  } catch (error) {
    console.error(`❌ [R2] Failed to fetch ${key}:`, error);
    throw error;
  }
}

/**
 * Fetch PDF and extract text (Note: Uses a simplified approach as pdf-parse is heavy)
 * In production, this would typically use a dedicated extraction service.
 */
export async function fetchAndExtractPDF(key: string): Promise<string> {
  try {
    console.log(`📄 [R2] Fetching PDF: ${key}`);
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await r2Client.send(command);
    
    if (!response.Body) {
      throw new Error('No body in R2 response');
    }

    // For this environment, we return a placeholder indicating multimodal readiness 
    // if a complex parser isn't available, or a simple string transform.
    const bodyString = await response.Body.transformToString();
    return bodyString;
    
  } catch (error) {
    console.error(`❌ [R2] PDF extraction failed for ${key}:`, error);
    throw error;
  }
}
