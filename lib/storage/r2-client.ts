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
    console.log(`📥 [R2] Fetching text-based document: ${key}`);
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await r2Client.send(command);
    
    if (!response.Body) {
      throw new Error('Empty body returned from cloud storage.');
    }

    const bodyString = await response.Body.transformToString();
    return bodyString;
  } catch (error) {
    console.error(`❌ [R2] Fetch failed for ${key}:`, error);
    throw error;
  }
}

/**
 * Fetch PDF and extract text using pdf-parse (Dynamically imported)
 */
export async function fetchAndExtractPDF(key: string): Promise<string> {
  try {
    console.log(`📄 [R2] Fetching and parsing PDF: ${key}`);
    
    // Dynamic import to prevent build-time ENOENT errors from pdf-parse internal tests
    const pdf = (await import('pdf-parse')).default;
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await r2Client.send(command);
    
    if (!response.Body) {
      throw new Error('No content found in PDF object.');
    }

    const bytes = await response.Body.transformToByteArray();
    const buffer = Buffer.from(bytes);
    
    const data = await pdf(buffer);
    console.log(`✅ [R2] Extracted ${data.text.length} characters from ${data.numpages} pages.`);
    
    return data.text;
    
  } catch (error) {
    console.error(`❌ [R2] PDF neural extraction failed for ${key}:`, error);
    return `[PDF Extraction Error: ${key}]`;
  }
}
