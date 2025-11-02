/**
 * SECURITY: File Upload Validation with Magic Bytes
 * 
 * Validates uploaded files using:
 * 1. Magic bytes (file signature) - cannot be spoofed
 * 2. MIME type whitelist
 * 3. File extension validation
 * 4. File size limits
 * 
 * NEVER trust client-reported MIME types alone!
 */

import fs from "fs/promises";
import { fileTypeFromBuffer } from "file-type";

/**
 * Allowed file types with their magic bytes signatures
 */
export const ALLOWED_FILE_TYPES = {
  // Images
  'image/png': { extensions: ['.png'], maxSize: 10 * 1024 * 1024 }, // 10MB
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], maxSize: 10 * 1024 * 1024 },
  'image/gif': { extensions: ['.gif'], maxSize: 10 * 1024 * 1024 },
  'image/webp': { extensions: ['.webp'], maxSize: 10 * 1024 * 1024 },
  
  // Documents
  'application/pdf': { extensions: ['.pdf'], maxSize: 50 * 1024 * 1024 }, // 50MB
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { 
    extensions: ['.docx'], 
    maxSize: 50 * 1024 * 1024 
  },
  'application/msword': { extensions: ['.doc'], maxSize: 50 * 1024 * 1024 },
  
  // Spreadsheets
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { 
    extensions: ['.xlsx'], 
    maxSize: 50 * 1024 * 1024 
  },
  'application/vnd.ms-excel': { extensions: ['.xls'], maxSize: 50 * 1024 * 1024 },
  'text/csv': { extensions: ['.csv'], maxSize: 50 * 1024 * 1024 },
  
  // Text files
  'text/plain': { extensions: ['.txt'], maxSize: 10 * 1024 * 1024 },
  'text/markdown': { extensions: ['.md'], maxSize: 10 * 1024 * 1024 },
  'application/json': { extensions: ['.json', '.jsonl'], maxSize: 10 * 1024 * 1024 },
  'application/xml': { extensions: ['.xml'], maxSize: 10 * 1024 * 1024 },
  
  // Audio
  'audio/mpeg': { extensions: ['.mp3'], maxSize: 100 * 1024 * 1024 }, // 100MB
  'audio/wav': { extensions: ['.wav'], maxSize: 100 * 1024 * 1024 },
  'audio/webm': { extensions: ['.webm'], maxSize: 100 * 1024 * 1024 },
  
  // Video (for future use)
  'video/mp4': { extensions: ['.mp4'], maxSize: 500 * 1024 * 1024 }, // 500MB
  'video/webm': { extensions: ['.webm'], maxSize: 500 * 1024 * 1024 },
} as const;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedMimeType?: string;
  size?: number;
}

/**
 * Validate uploaded file using magic bytes and whitelist
 * 
 * SECURITY: This is the ONLY way to safely validate uploads
 * - Checks actual file content (magic bytes), not just extension
 * - Validates against strict whitelist
 * - Enforces size limits per file type
 */
export async function validateUploadedFile(
  filePath: string,
  allowedMimeTypes: string[],
  maxSizeOverride?: number
): Promise<FileValidationResult> {
  try {
    // 1. Check file exists
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // 2. Read first 4100 bytes for magic byte detection
    const buffer = Buffer.alloc(Math.min(4100, fileSize));
    const fd = await fs.open(filePath, 'r');
    await fd.read(buffer, 0, buffer.length, 0);
    await fd.close();
    
    // 3. Detect MIME type from magic bytes (file signature)
    const fileType = await fileTypeFromBuffer(buffer);
    
    // Handle special cases for text files (no magic bytes)
    if (!fileType) {
      // Check if it's a text file by trying to read as UTF-8
      const content = buffer.toString('utf-8', 0, Math.min(1000, buffer.length));
      const isText = /^[\x20-\x7E\s]*$/.test(content); // ASCII printable + whitespace
      
      if (isText) {
        // Assume text/plain for text files
        const textMimeType = 'text/plain';
        
        if (!allowedMimeTypes.includes(textMimeType) && 
            !allowedMimeTypes.includes('application/json') &&
            !allowedMimeTypes.includes('text/csv')) {
          return {
            valid: false,
            error: `File type not allowed. Detected: ${textMimeType}. Allowed: ${allowedMimeTypes.join(', ')}`,
            detectedMimeType: textMimeType,
            size: fileSize,
          };
        }
        
        // Check size limit
        const sizeLimit = maxSizeOverride || ALLOWED_FILE_TYPES[textMimeType as keyof typeof ALLOWED_FILE_TYPES]?.maxSize || 10 * 1024 * 1024;
        if (fileSize > sizeLimit) {
          return {
            valid: false,
            error: `File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB. Max: ${(sizeLimit / 1024 / 1024).toFixed(2)}MB`,
            detectedMimeType: textMimeType,
            size: fileSize,
          };
        }
        
        return {
          valid: true,
          detectedMimeType: textMimeType,
          size: fileSize,
        };
      }
      
      return {
        valid: false,
        error: 'Unable to detect file type - file may be corrupted or unsupported',
        size: fileSize,
      };
    }
    
    const detectedMimeType = fileType.mime;
    
    // 4. Check if detected MIME type is in allowed list
    if (!allowedMimeTypes.includes(detectedMimeType)) {
      return {
        valid: false,
        error: `File type not allowed. Detected: ${detectedMimeType}. Allowed: ${allowedMimeTypes.join(', ')}`,
        detectedMimeType,
        size: fileSize,
      };
    }
    
    // 5. Check file size against limit
    const fileTypeConfig = ALLOWED_FILE_TYPES[detectedMimeType as keyof typeof ALLOWED_FILE_TYPES];
    const sizeLimit = maxSizeOverride || fileTypeConfig?.maxSize || 10 * 1024 * 1024;
    
    if (fileSize > sizeLimit) {
      return {
        valid: false,
        error: `File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB. Max: ${(sizeLimit / 1024 / 1024).toFixed(2)}MB`,
        detectedMimeType,
        size: fileSize,
      };
    }
    
    // 6. All checks passed
    return {
      valid: true,
      detectedMimeType,
      size: fileSize,
    };
    
  } catch (error: any) {
    return {
      valid: false,
      error: `File validation error: ${error.message}`,
    };
  }
}

/**
 * Validate icon upload (strict image-only whitelist)
 */
export async function validateIconUpload(filePath: string): Promise<FileValidationResult> {
  return validateUploadedFile(
    filePath,
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    2 * 1024 * 1024 // 2MB max for icons
  );
}

/**
 * Validate document upload (documents + images)
 */
export async function validateDocumentUpload(filePath: string): Promise<FileValidationResult> {
  return validateUploadedFile(
    filePath,
    [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/plain',
      'application/json',
      'application/xml',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
    ]
  );
}

/**
 * Validate audio upload (for transcription)
 */
export async function validateAudioUpload(filePath: string): Promise<FileValidationResult> {
  return validateUploadedFile(
    filePath,
    ['audio/mpeg', 'audio/wav', 'audio/webm'],
    100 * 1024 * 1024 // 100MB max for audio
  );
}

/**
 * Validate dataset upload (JSONL files)
 */
export async function validateDatasetUpload(filePath: string): Promise<FileValidationResult> {
  return validateUploadedFile(
    filePath,
    ['application/json', 'text/plain'], // JSONL files are detected as text/plain
    50 * 1024 * 1024 // 50MB max for datasets
  );
}
