/**
 * STORAGE PATHS CONFIGURATION
 * 
 * Separação clara entre armazenamento temporário e permanente:
 * - TEMPORÁRIO: attached_assets/ (apenas chat, limpo automaticamente)
 * - PERMANENTE: kb_storage/, curation_storage/, system_storage/ (NUNCA limpar automaticamente)
 */

import * as path from 'path';

const BASE_DIR = process.cwd();

/**
 * TEMPORÁRIO - Arquivos de chat que podem ser apagados
 */
export const TEMP_STORAGE = {
  ROOT: path.join(BASE_DIR, 'attached_assets'),
  CHAT_TEMP: path.join(BASE_DIR, 'attached_assets', 'chat_temp'),
} as const;

/**
 * PERMANENTE - Knowledge Base aprovada (NUNCA limpar automaticamente)
 */
export const KB_STORAGE = {
  ROOT: path.join(BASE_DIR, 'kb_storage'),
  IMAGES: path.join(BASE_DIR, 'kb_storage', 'images'),
  DOCUMENTS: path.join(BASE_DIR, 'kb_storage', 'documents'),
  MEDIA: path.join(BASE_DIR, 'kb_storage', 'media'),
} as const;

/**
 * PERMANENTE - Curadoria (limpeza controlada apenas para rejeitados)
 */
export const CURATION_STORAGE = {
  ROOT: path.join(BASE_DIR, 'curation_storage'),
  PENDING: path.join(BASE_DIR, 'curation_storage', 'pending'),
  APPROVED: path.join(BASE_DIR, 'curation_storage', 'approved'),
  REJECTED: path.join(BASE_DIR, 'curation_storage', 'rejected'),
} as const;

/**
 * PERMANENTE - Sistema (backups, configs, etc - NUNCA limpar)
 */
export const SYSTEM_STORAGE = {
  ROOT: path.join(BASE_DIR, 'system_storage'),
  BACKUPS: path.join(BASE_DIR, 'system_storage', 'backups'),
} as const;

/**
 * DEPRECATED - Mantido apenas para compatibilidade temporária durante migração
 * @deprecated Use KB_STORAGE.IMAGES instead
 */
export const LEGACY_PATHS = {
  LEARNED_IMAGES: path.join(BASE_DIR, 'attached_assets', 'learned_images'),
} as const;

/**
 * Garante que todos os diretórios permanentes existam
 */
export async function ensureStorageDirectories() {
  const fs = await import('fs/promises');
  
  const permanentDirs = [
    KB_STORAGE.ROOT,
    KB_STORAGE.IMAGES,
    KB_STORAGE.DOCUMENTS,
    KB_STORAGE.MEDIA,
    CURATION_STORAGE.ROOT,
    CURATION_STORAGE.PENDING,
    CURATION_STORAGE.APPROVED,
    CURATION_STORAGE.REJECTED,
    SYSTEM_STORAGE.ROOT,
    SYSTEM_STORAGE.BACKUPS,
  ];
  
  for (const dir of permanentDirs) {
    await fs.mkdir(dir, { recursive: true });
  }
  
  console.log('[Storage] ✅ Permanent storage directories ensured');
}
