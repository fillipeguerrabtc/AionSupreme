/**
 * STORAGE PATHS - Configuração Centralizada de Armazenamento
 * 
 * ✅ CRITICAL: Separação entre storage TEMPORÁRIO vs PERMANENTE
 * 
 * TEMPORÁRIO (attached_assets/): 
 * - Limpo a cada commit
 * - Apenas para assets gerados/temporários
 * 
 * PERMANENTE (data/):
 * - Persistente entre commits
 * - Para imagens aprovadas, modelos treinados, etc
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

export function getStoragePaths(): StoragePaths {
  const rootDir = process.cwd();
  
  // ✅ PERMANENTE - data/ (persiste entre commits)
  const dataDir = path.join(rootDir, 'data');
  const learnedImages = path.join(dataDir, 'learned_images');
  const datasets = path.join(dataDir, 'datasets');
  const trainedModels = path.join(dataDir, 'trained_models');
  
  // ⚠️ TEMPORÁRIO - attached_assets/ (limpa a cada commit)
  const tempUploads = path.join(rootDir, 'attached_assets', 'temp_uploads');
  const tempAssets = path.join(rootDir, 'attached_assets');
  
  // Garante que pastas PERMANENTES existem
  ensureDir(dataDir);
  ensureDir(learnedImages);
  ensureDir(datasets);
  ensureDir(trainedModels);
  
  // Garante que pastas TEMPORÁRIAS existem
  ensureDir(tempUploads);
  
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
