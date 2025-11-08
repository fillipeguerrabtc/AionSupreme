/**
 * MIME Type Inference - Utilitário para inferir mimeType de attachments
 * 
 * PROBLEMA: Attachments históricos podem ter base64 SEM mimeType
 * SOLUÇÃO: Inferir mimeType de filename extension ou fallback seguro
 */

export function inferMimeTypeFromFilename(filename: string): string | null {
  if (!filename) return null;
  
  const ext = filename.toLowerCase().split('.').pop();
  if (!ext) return null;
  
  const mimeMap: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    // Video
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'avi': 'video/avi',
    'mov': 'video/quicktime',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
  };
  
  return mimeMap[ext] || null;
}

/**
 * Inferir mimeType de magic bytes (base64)
 * Suporta apenas formatos de imagem mais comuns
 */
export function inferMimeTypeFromBase64(base64: string): string | null {
  if (!base64 || base64.length < 4) return null;
  
  // Pega primeiros bytes
  const firstBytes = base64.substring(0, 20);
  
  // PNG: 89 50 4E 47 (iVBORw in base64)
  if (firstBytes.startsWith('iVBORw')) return 'image/png';
  
  // JPEG: FF D8 FF (starts with /9j/ in base64)
  if (firstBytes.startsWith('/9j/')) return 'image/jpeg';
  
  // GIF: 47 49 46 38 (R0lG in base64)
  if (firstBytes.startsWith('R0lG')) return 'image/gif';
  
  // WebP: 52 49 46 46 ... 57 45 42 50 (UklGR...V0VCU in base64)
  if (firstBytes.includes('UklGR') && base64.includes('V0VCU')) return 'image/webp';
  
  return null;
}

/**
 * Estratégia completa de inferência de mimeType
 * 1. Tenta inferir de filename extension
 * 2. Tenta inferir de magic bytes (base64)
 * 3. Fallback para image/jpeg (formato mais comum)
 */
export function inferMimeType(filename: string, base64?: string): string {
  // Tenta filename primeiro
  const fromFilename = inferMimeTypeFromFilename(filename);
  if (fromFilename) {
    console.log(`   🔍 MIME inferred from filename: ${fromFilename}`);
    return fromFilename;
  }
  
  // Tenta magic bytes
  if (base64) {
    const fromMagicBytes = inferMimeTypeFromBase64(base64);
    if (fromMagicBytes) {
      console.log(`   🔍 MIME inferred from magic bytes: ${fromMagicBytes}`);
      return fromMagicBytes;
    }
  }
  
  // Fallback seguro para image/jpeg
  console.log(`   ⚠️ MIME inference failed, using fallback: image/jpeg`);
  return 'image/jpeg';
}
