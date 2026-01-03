
export type UploadProgress = (percentage: number, status: string) => void;

interface UploadResult {
  id: string;
  name: string;
  filePath: string;
  mimeType: string;
  storage: 'r2' | 'supabase';
  isPublic: boolean;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1500;
const REQUEST_TIMEOUT = 90000; // 90 seconds to allow for larger files or slow connections

/**
 * Client-side Document Ingestion Orchestrator with Resilience
 * Uses XMLHttpRequest for progress tracking and implements retries with exponential backoff.
 * Communicates with /api/docs/upload which manages R2 vs Supabase storage selection.
 */
export async function uploadDocument(
  file: File,
  userId: string,
  onProgress: UploadProgress
): Promise<UploadResult> {
  let attempt = 0;

  const executeUpload = (): Promise<UploadResult> => {
    return new Promise((resolve, reject) => {
      attempt++;
      const statusPrefix = attempt > 1 ? `[Attempt ${attempt}/${MAX_RETRIES}] ` : '';
      onProgress(5, `${statusPrefix}Handshaking with cloud nodes...`);

      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', userId);

      // Set timeout for the entire request
      xhr.timeout = REQUEST_TIMEOUT;

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          // Calculate overall progress: 10% base + up to 80% upload + 10% server processing
          const percentage = Math.round((event.loaded / event.total) * 80) + 10;
          onProgress(percentage, `${statusPrefix}Streaming bits to secure gateway... (${percentage}%)`);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            onProgress(100, 'Handshake Complete!');
            resolve(result);
          } catch (e) {
            reject(new Error('Malformed response from cloud gateway.'));
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            const msg = errorData.error || `Gateway error (Status: ${xhr.status})`;
            reject(new Error(msg));
          } catch (e) {
            reject(new Error(`The cloud node rejected the upload (Status: ${xhr.status})`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network connectivity failure during curriculum ingestion.'));
      });

      xhr.addEventListener('timeout', () => {
        reject(new Error('Ingestion request timed out (Limit: 90s).'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload operation was aborted by the user.'));
      });

      xhr.open('POST', '/api/docs/upload');
      
      // Note: Supabase session cookies are handled automatically by the browser.
      xhr.send(formData);
    });
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  while (attempt < MAX_RETRIES) {
    try {
      return await executeUpload();
    } catch (err: any) {
      // Determine if error is transient and worth retrying
      const errorMessage = err.message || '';
      const isTransient = 
        errorMessage.includes('Network connectivity') || 
        errorMessage.includes('timed out') || 
        errorMessage.includes('Status: 502') ||
        errorMessage.includes('Status: 503') ||
        errorMessage.includes('Status: 504');

      if (attempt < MAX_RETRIES && isTransient) {
        const backoff = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        onProgress(0, `Transient error: ${errorMessage}. Retrying in ${Math.round(backoff / 1000)}s...`);
        await delay(backoff);
      } else {
        // Log final failure before throwing to UI
        console.error(`Final Ingestion Failure: ${errorMessage}`, { attempt, fileName: file.name });
        throw err;
      }
    }
  }

  throw new Error('Maximum curriculum ingestion retries exceeded.');
}
