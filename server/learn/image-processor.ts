/**
 * IMAGE PROCESSOR - Processamento de Imagens com Vision API
 * 
 * Baixa imagens e gera descrições textuais usando Gemini Vision.
 * As descrições são indexadas na KB para RAG textual.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { VisionCascade } from "./vision-cascade";

export interface ProcessedImage {
  localPath: string;
  description: string;
  originalUrl: string;
}

export class ImageProcessor {
  private imagesDir = path.join(process.cwd(), 'attached_assets', 'learned_images');
  private maxImageSize = 10 * 1024 * 1024; // 10MB max
  private visionCascade: VisionCascade;

  constructor() {
    // Garante que diretório existe
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }
    
    // Inicializa Vision Cascade (Gemini → HF → OpenAI)
    this.visionCascade = new VisionCascade();
  }

  /**
   * Processa uma imagem: baixa e gera descrição com Vision API
   */
  async processImage(imageUrl: string, alt?: string): Promise<ProcessedImage | null> {
    try {
      // Baixa imagem
      const localPath = await this.downloadImage(imageUrl);
      
      if (!localPath) {
        console.log(`   ⚠️ Falha ao baixar: ${imageUrl}`);
        return null;
      }

      // Gera descrição com Vision API
      const description = await this.generateDescription(localPath, alt);

      console.log(`   ✓ Imagem processada: ${path.basename(localPath)}`);
      if (description && !description.includes('Erro') && !description.includes('sem descrição')) {
        console.log(`     📝 Descrição AI: ${description.substring(0, 100)}...`);
      } else if (alt) {
        console.log(`     📝 Alt text: ${alt}`);
      } else {
        console.log(`     ⚠️ Sem descrição disponível`);
      }

      return {
        localPath: path.relative(process.cwd(), localPath),
        description: description || alt || 'Sem descrição',
        originalUrl: imageUrl
      };

    } catch (error: any) {
      console.error(`[ImageProcessor] Erro ao processar ${imageUrl}:`, error.message);
      return null;
    }
  }

  /**
   * Baixa imagem e salva localmente
   */
  private async downloadImage(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000) // 15s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.startsWith('image/')) {
        console.log(`   ⚠️ Não é imagem: ${contentType}`);
        return null;
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      if (contentLength > this.maxImageSize) {
        console.log(`   ⚠️ Imagem muito grande: ${contentLength} bytes`);
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Gera nome DESCRITIVO baseado em URL + hash para unicidade
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1] || 'image';
      const cleanName = lastPart
        .replace(/\.[^.]+$/, '') // Remove extensão existente
        .replace(/[^a-zA-Z0-9-_]/g, '_') // Sanitiza caracteres especiais
        .substring(0, 50); // Limita tamanho
      
      const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
      const ext = this.getExtensionFromContentType(contentType) || 'jpg';
      const filename = `${cleanName}_${hash}.${ext}`;
      const filepath = path.join(this.imagesDir, filename);

      // Salva se não existe
      if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, buffer);
      }

      return filepath;

    } catch (error: any) {
      console.error(`[ImageProcessor] Erro ao baixar ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Gera descrição da imagem usando Vision Cascade (Gemini → HF → OpenAI)
   */
  private async generateDescription(imagePath: string, alt?: string): Promise<string> {
    try {
      // Lê imagem
      const imageBuffer = fs.readFileSync(imagePath);
      const mimeType = this.getMimeType(imagePath);

      // Usa Vision Cascade (tenta Gemini → HF → OpenAI automaticamente)
      const result = await this.visionCascade.generateDescription(imageBuffer, mimeType, alt);

      if (result.success) {
        console.log(`   ✅ Vision API: ${result.provider} (${result.tokensUsed} tokens)`);
        return result.description;
      } else {
        console.warn(`   ⚠️ Todas Vision APIs falharam - usando alt text`);
        return alt || 'Imagem sem descrição (APIs falharam)';
      }

    } catch (error: any) {
      console.error(`[ImageProcessor] ❌ Erro ao gerar descrição:`, error.message);
      return alt || 'Erro ao processar imagem';
    }
  }

  /**
   * Determina MIME type da imagem
   */
  private getMimeType(filepath: string): string {
    const ext = path.extname(filepath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Extrai extensão do Content-Type
   */
  private getExtensionFromContentType(contentType: string): string | null {
    const match = contentType.match(/image\/(jpeg|jpg|png|gif|webp)/i);
    if (match) {
      return match[1] === 'jpeg' ? 'jpg' : match[1];
    }
    return null;
  }

  /**
   * Remove imagens não utilizadas (limpeza)
   */
  async cleanup(keepPaths: string[]): Promise<void> {
    const files = fs.readdirSync(this.imagesDir);
    const keepFilenames = new Set(keepPaths.map(p => path.basename(p)));

    let removed = 0;
    for (const file of files) {
      if (!keepFilenames.has(file)) {
        const filepath = path.join(this.imagesDir, file);
        fs.unlinkSync(filepath);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[ImageProcessor] 🗑️ ${removed} imagens não utilizadas removidas`);
    }
  }
}
