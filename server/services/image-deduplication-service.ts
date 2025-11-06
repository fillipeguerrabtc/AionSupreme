/**
 * Image Deduplication Service
 * 
 * Detects duplicate and similar images using perceptual hashing (dHash algorithm)
 * dHash (difference hash) compares image gradients - robust against resizing, minor edits
 * 
 * How it works:
 * 1. Resize image to 9x8 (72 pixels)
 * 2. Convert to grayscale
 * 3. Calculate horizontal gradients
 * 4. Generate 64-bit hash
 * 5. Compare hashes using Hamming distance
 * 
 * Similarity thresholds:
 * - Hamming distance 0-5: EXACT duplicate (>90% similar)
 * - Hamming distance 6-15: NEAR duplicate (70-90% similar)
 * - Hamming distance >15: UNIQUE (different image)
 */

import sharp from 'sharp';
import * as crypto from 'crypto';

export interface ImageHash {
  perceptualHash: string;  // 64-bit dhash as hex string
  md5Hash: string;         // Traditional MD5 for exact byte match
}

export interface ImageSimilarityResult {
  isDuplicate: boolean;
  similarity: number;        // 0-100%
  hammingDistance: number;   // 0-64 bits different
  duplicateOf?: {
    id: string;
    filename: string;
    hash: string;
  };
  method: 'perceptual' | 'md5' | 'none';
}

export class ImageDeduplicationService {
  
  /**
   * Gera hash perceptual (dHash) de uma imagem
   * @param buffer Buffer da imagem
   * @returns ImageHash com perceptual + MD5
   */
  async generateImageHash(buffer: Buffer): Promise<ImageHash> {
    try {
      // 1. MD5 hash (para exact match rápido)
      const md5Hash = crypto.createHash('md5').update(buffer).digest('hex');
      
      // 2. Perceptual hash (dHash algorithm)
      const perceptualHash = await this.calculateDHash(buffer);
      
      return {
        perceptualHash,
        md5Hash
      };
    } catch (error: any) {
      console.error('[ImageDedup] Erro ao gerar hash:', error.message);
      throw error;
    }
  }
  
  /**
   * Calcula dHash (difference hash) usando sharp
   * @param buffer Buffer da imagem
   * @returns 64-bit hash como hex string (16 caracteres)
   */
  private async calculateDHash(buffer: Buffer): Promise<string> {
    try {
      // Resize para 9x8 (72 pixels) e converte para grayscale
      const { data, info } = await sharp(buffer)
        .resize(9, 8, {
          fit: 'fill',
          kernel: sharp.kernel.nearest
        })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // Calcula diferenças horizontais (9x8 -> 8x8 = 64 bits)
      let hash = BigInt(0);
      let bitIndex = 0;
      
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const leftPixel = data[y * 9 + x];
          const rightPixel = data[y * 9 + x + 1];
          
          // Se pixel da esquerda > direita, bit = 1
          if (leftPixel > rightPixel) {
            hash |= BigInt(1) << BigInt(bitIndex);
          }
          bitIndex++;
        }
      }
      
      // Converte BigInt para hex string (16 caracteres = 64 bits)
      return hash.toString(16).padStart(16, '0');
      
    } catch (error: any) {
      console.error('[ImageDedup] Erro ao calcular dHash:', error.message);
      throw error;
    }
  }
  
  /**
   * Compara dois hashes perceptuais usando Hamming Distance
   * @param hash1 First perceptual hash
   * @param hash2 Second perceptual hash
   * @returns Hamming distance (0-64 bits different)
   */
  compareHashes(hash1: string, hash2: string): number {
    try {
      const bigInt1 = BigInt('0x' + hash1);
      const bigInt2 = BigInt('0x' + hash2);
      
      // XOR para encontrar bits diferentes
      const xor = bigInt1 ^ bigInt2;
      
      // Conta bits set (Hamming distance)
      let distance = 0;
      let temp = xor;
      while (temp > BigInt(0)) {
        distance += Number(temp & BigInt(1));
        temp >>= BigInt(1);
      }
      
      return distance;
    } catch (error: any) {
      console.error('[ImageDedup] Erro ao comparar hashes:', error.message);
      return 64; // Maximum distance (completely different)
    }
  }
  
  /**
   * Calcula similaridade percentual a partir de Hamming distance
   * @param hammingDistance 0-64 bits different
   * @returns Similarity 0-100%
   */
  calculateSimilarity(hammingDistance: number): number {
    return Math.round((1 - hammingDistance / 64) * 100);
  }
  
  /**
   * Determina se duas imagens são duplicatas baseado em Hamming distance
   * @param hammingDistance Hamming distance between hashes
   * @returns Duplication status: 'exact', 'near', or 'unique'
   */
  getDuplicationStatus(hammingDistance: number): 'exact' | 'near' | 'unique' {
    if (hammingDistance <= 5) return 'exact';   // 92%+ similar
    if (hammingDistance <= 15) return 'near';   // 76%+ similar
    return 'unique';                             // <76% similar
  }
  
  /**
   * Compara uma imagem com lista de hashes existentes
   * @param imageHash Hash da imagem a verificar
   * @param existingHashes Lista de hashes existentes no sistema
   * @returns Resultado da similaridade
   */
  async findSimilarImages(
    imageHash: ImageHash,
    existingHashes: Array<{ id: string; filename: string; perceptualHash: string; md5Hash: string }>
  ): Promise<ImageSimilarityResult> {
    try {
      // 1. Primeiro tenta MD5 (exact byte match)
      const md5Match = existingHashes.find(h => h.md5Hash === imageHash.md5Hash);
      if (md5Match) {
        return {
          isDuplicate: true,
          similarity: 100,
          hammingDistance: 0,
          duplicateOf: {
            id: md5Match.id,
            filename: md5Match.filename,
            hash: md5Match.md5Hash
          },
          method: 'md5'
        };
      }
      
      // 2. Usa perceptual hash (similarity match)
      let bestMatch: typeof existingHashes[0] | null = null;
      let lowestDistance = 64;
      
      for (const existing of existingHashes) {
        const distance = this.compareHashes(imageHash.perceptualHash, existing.perceptualHash);
        if (distance < lowestDistance) {
          lowestDistance = distance;
          bestMatch = existing;
        }
      }
      
      if (bestMatch && lowestDistance <= 15) {
        const similarity = this.calculateSimilarity(lowestDistance);
        return {
          isDuplicate: true,
          similarity,
          hammingDistance: lowestDistance,
          duplicateOf: {
            id: bestMatch.id,
            filename: bestMatch.filename,
            hash: bestMatch.perceptualHash
          },
          method: 'perceptual'
        };
      }
      
      // 3. Nenhuma duplicata encontrada
      return {
        isDuplicate: false,
        similarity: 0,
        hammingDistance: 64,
        method: 'none'
      };
      
    } catch (error: any) {
      console.error('[ImageDedup] Erro ao buscar similares:', error.message);
      return {
        isDuplicate: false,
        similarity: 0,
        hammingDistance: 64,
        method: 'none'
      };
    }
  }
}

// Singleton instance
export const imageDeduplicationService = new ImageDeduplicationService();
