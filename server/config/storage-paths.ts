/**
 * STORAGE PATHS - Configuração Centralizada de Armazenamento
 * 
 * ✅ CRITICAL: Separação entre storage TEMPORÁRIO vs PERMANENTE
 * 
 * TEMPORÁRIO (attached_assets/): 
 * - Limpo a cada commit
 * - Apenas para assets gerados/temporários
 * 
 * PERMANENTE (kb_storage/, curation_storage/, data/):
 * - Persistente entre commits
 * - Para imagens aprovadas, modelos treinados, curadoria HITL
 */

import * as path from 'path';
import * as fs from 'fs';

export interface StoragePaths {
  // ✅ PERMANENTE - Imagens aprovadas pela curadoria HITL
  learnedImages: string;
  
  // ✅ PERMANENTE - Datasets de treino gerados
  datasets: string;
  
  // ✅ PERMANENTE - Modelos treinados (LoRA adapters)
  trainedModels: string;
  
  // ⚠️ TEMPORÁRIO - Assets gerados/uploads temporários
  tempUploads: string;
  tempAssets: string;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[StoragePaths] ✅ Created: ${dirPath}`);
  }
}

// ========================================
// MODERN STORAGE ARCHITECTURE (2025)
// ========================================

const rootDir = process.cwd();

// 🗂️ PERMANENT STORAGE - KB (Knowledge Base)
export const KB_STORAGE = {
  ROOT: path.join(rootDir, 'kb_storage'),
  IMAGES: path.join(rootDir, 'kb_storage', 'images'),
  DOCUMENTS: path.join(rootDir, 'kb_storage', 'documents'),
  MEDIA: path.join(rootDir, 'kb_storage', 'media'),
};

// 🔄 CURATION STORAGE - HITL (Human-in-the-Loop)
export const CURATION_STORAGE = {
  ROOT: path.join(rootDir, 'curation_storage'),
  PENDING: path.join(rootDir, 'curation_storage', 'pending'),
};

// ⚡ TEMPORARY STORAGE - attached_assets/
// NOTE: NEW uploads use curation_storage/pending/, but chat_images/ kept for backward compatibility
export const TEMP_STORAGE = {
  ROOT: path.join(rootDir, 'attached_assets'),
  UPLOADS: path.join(rootDir, 'attached_assets', 'temp_uploads'),
  CHAT_IMAGES: path.join(rootDir, 'attached_assets', 'chat_images'), // Backward compatibility
  GENERATED: path.join(rootDir, 'attached_assets', 'generated_images'),
};

// 📦 LEGACY DATA STORAGE (backward compatibility)
const dataDir = path.join(rootDir, 'data');

/**
 * Ensure all storage directories exist
 */
export function ensureStorageDirectories(): void {
  // KB Storage (permanent)
  ensureDir(KB_STORAGE.ROOT);
  ensureDir(KB_STORAGE.IMAGES);
  ensureDir(KB_STORAGE.DOCUMENTS);
  ensureDir(KB_STORAGE.MEDIA);

  // Curation Storage (pending HITL approval)
  ensureDir(CURATION_STORAGE.ROOT);
  ensureDir(CURATION_STORAGE.PENDING);

  // Temporary Storage
  ensureDir(TEMP_STORAGE.ROOT);
  ensureDir(TEMP_STORAGE.UPLOADS);
  ensureDir(TEMP_STORAGE.CHAT_IMAGES); // Backward compatibility
  ensureDir(TEMP_STORAGE.GENERATED);

  // Legacy data/ storage (backward compatibility)
  ensureDir(dataDir);
  ensureDir(path.join(dataDir, 'learned_images'));
  ensureDir(path.join(dataDir, 'datasets'));
  ensureDir(path.join(dataDir, 'trained_models'));
}

export function getStoragePaths(): StoragePaths {
  // ✅ PERMANENTE - data/ (persiste entre commits)
  const learnedImages = path.join(dataDir, 'learned_images');
  const datasets = path.join(dataDir, 'datasets');
  const trainedModels = path.join(dataDir, 'trained_models');
  
  // ⚠️ TEMPORÁRIO - attached_assets/ (limpa a cada commit)
  const tempUploads = TEMP_STORAGE.UPLOADS;
  const tempAssets = TEMP_STORAGE.ROOT;
  
  // Garante que TODAS as pastas existem
  ensureStorageDirectories();
  
  return {
    learnedImages,
    datasets,
    trainedModels,
    tempUploads,
    tempAssets,
  };
}

// Singleton
export const storagePaths = getStoragePaths();
