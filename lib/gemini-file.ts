import { GoogleGenAI } from '@google/genai';

// Base64 conversion utility
export function fileToGenerativePart(base64Data: string, mimeType: string) {
  return {
    inlineData: {
      data: base64Data,
      mimeType,
    },
  };
}

// Supported document types
export const SUPPORTED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'text/plain': 'Text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (DOCX)',
  'application/msword': 'Word (DOC)',
  'text/csv': 'CSV',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (XLSX)',
  'image/jpeg': 'Image (JPEG)',
  'image/png': 'Image (PNG)',
  'image/webp': 'Image (WebP)',
};

export function isSupportedFileType(mimeType: string): boolean {
  return mimeType in SUPPORTED_MIME_TYPES;
}
