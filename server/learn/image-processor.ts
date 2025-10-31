/**
 * IMAGE PROCESSOR - Processamento de Imagens com Vision API
 * 
 * Baixa imagens e gera descrições textuais usando Gemini Vision.
 * As descrições são indexadas na KB para RAG textual.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ProcessedImage {
  localPath: string;
  description: string;
  originalUrl: string;
}

export class ImageProcessor {
  private imagesDir = path.join(process.cwd(), 'attached_assets', 'learned_images');
  private maxImageSize = 10 * 1024 * 1024; // 10MB max

  constructor() {
    // Garante que diretório existe
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }
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
      if (description) {
        console.log(`     📝 Descrição: ${description.substring(0, 100)}...`);
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

      // Gera nome único baseado em hash
      const hash = crypto.createHash('md5').update(url).digest('hex');
      const ext = this.getExtensionFromContentType(contentType) || 'jpg';
      const filename = `${hash}.${ext}`;
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
   * Gera descrição da imagem usando Gemini Vision API
   */
  private async generateDescription(imagePath: string, alt?: string): Promise<string> {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        console.warn(`[ImageProcessor] ⚠️ GEMINI_API_KEY não encontrada - usando alt text`);
        return alt || 'Sem descrição (Vision API não configurada)';
      }

      // Lê imagem como base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);

      // Prompt para Vision API
      const prompt = `Descreva esta imagem em detalhes para indexação em uma base de conhecimento. 
Inclua:
- O que está na imagem
- Cores, formas, objetos principais
- Contexto e ambiente
- Qualquer texto visível
- Informações relevantes para busca semântica

${alt ? `Contexto do alt text: "${alt}"` : ''}

Descrição detalhada:`;

      // Inicializa Gemini Vision API
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp'
      });

      // Chama API com imagem
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Image,
            mimeType
          }
        }
      ]);

      const response = result.response;
      const text = response.text();

      return text.trim();

    } catch (error: any) {
      console.error(`[ImageProcessor] Erro ao gerar descrição:`, error.message);
      return alt || 'Erro ao gerar descrição';
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
