/**
 * IMAGE GENERATION CASCADE - Sistema de fallback automático para geração de imagens
 * 
 * Cascata de prioridade (Free → Paid):
 * 1. Pollinations.ai (TOTALMENTE GRÁTIS, sem API key, ilimitado)
 * 2. OpenAI DALL-E 3 (PAGO - último recurso)
 * 
 * Similar ao VisionCascade, mas para geração ao invés de análise
 * 
 * TODO FUTURO: Adicionar HuggingFace FLUX.1-dev quando @huggingface/inference v3 estiver estável
 */

import OpenAI from "openai";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export type ImageGenProvider = 'pollinations' | 'dalle3' | 'none';

export interface ImageGenResult {
  imageUrl: string;
  localPath: string;
  provider: ImageGenProvider;
  success: boolean;
  revisedPrompt?: string;
  width: number;
  height: number;
}

export class ImageGenerationCascade {
  private openaiKey: string | undefined;
  private storageDir: string;
  
  // Quotas (reset diariamente)
  private pollinationsQuota = { used: 0, limit: 10000, lastReset: Date.now() }; // Sem limite real

  constructor() {
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.storageDir = path.join(process.cwd(), "kb_storage", "generated_images");
  }

  /**
   * Gera imagem usando cascade automático
   */
  async generateImage(params: {
    prompt: string;
    size?: "1024x1024" | "1024x1792" | "1792x1024";
    quality?: "standard" | "hd";
    style?: "vivid" | "natural";
  }): Promise<ImageGenResult> {
    const startTime = Date.now();
    
    // Reset quotas se necessário (a cada 24h)
    this.resetQuotasIfNeeded();

    const { prompt, size = "1024x1024", quality = "standard", style = "vivid" } = params;

    // 1. Tenta Pollinations.ai primeiro (100% GRÁTIS, sem API key)
    if (this.hasQuota('pollinations')) {
      try {
        const result = await this.tryPollinations(prompt, size);
        console.log(`[ImageGenCascade] ✅ Pollinations.ai (${Date.now() - startTime}ms) - FREE`);
        return result;
      } catch (error: any) {
        console.warn(`[ImageGenCascade] ⚠️ Pollinations.ai falhou: ${error.message}`);
      }
    } else {
      console.log(`[ImageGenCascade] ⏭️ Pollinations.ai quota esgotada (${this.pollinationsQuota.used}/${this.pollinationsQuota.limit})`);
    }

    // 2. Último recurso: DALL-E 3 (PAGO)
    if (this.openaiKey) {
      try {
        const result = await this.tryDALLE3(prompt, size, quality, style);
        console.log(`[ImageGenCascade] ✅ DALL-E 3 (${Date.now() - startTime}ms) - $$$`);
        return result;
      } catch (error: any) {
        console.error(`[ImageGenCascade] ❌ DALL-E 3 falhou: ${error.message}`);
        throw error; // Re-throw para que o caller saiba que falhou
      }
    }

    throw new Error("Todas as APIs de geração de imagens falharam. Verifique as configurações e tente novamente.");
  }

  /**
   * Tenta Pollinations.ai (100% FREE, sem API key)
   * URL: https://image.pollinations.ai/prompt/{prompt}?width={w}&height={h}&nologo=true
   */
  private async tryPollinations(prompt: string, size: string): Promise<ImageGenResult> {
    const [width, height] = size.split("x").map(Number);
    
    // URL encode do prompt
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&enhance=true`;

    console.log(`[Pollinations] Gerando imagem: ${imageUrl}`);

    // Baixar imagem
    const response = await axios.get(imageUrl, { 
      responseType: "arraybuffer",
      timeout: 60000, // 60s timeout
    });

    const imageBuffer = Buffer.from(response.data);

    // Salvar localmente
    const filename = `pollinations-${crypto.randomBytes(16).toString("hex")}.png`;
    const localPath = await this.saveImage(imageBuffer, filename);

    // Incrementar quota
    this.pollinationsQuota.used++;

    // Gerar relative URL web-accessible
    const relativeUrl = `/kb_storage/generated_images/${filename}`;

    return {
      imageUrl: relativeUrl, // Use relative path para internal access
      localPath,
      provider: 'pollinations',
      success: true,
      width,
      height,
    };
  }

  /**
   * Tenta DALL-E 3 (OpenAI - PAGO)
   */
  private async tryDALLE3(
    prompt: string,
    size: string,
    quality: "standard" | "hd",
    style: "vivid" | "natural"
  ): Promise<ImageGenResult> {
    const openai = new OpenAI({ apiKey: this.openaiKey });

    console.log(`[DALL-E 3] Gerando imagem: "${prompt.slice(0, 60)}..."`);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: size as "1024x1024" | "1024x1792" | "1792x1024",
      quality,
      style,
      response_format: "url",
    });

    if (!response.data || response.data.length === 0) {
      throw new Error("DALL-E 3 returned no image data");
    }

    const imageData = response.data[0];
    const imageUrl = imageData.url;
    const revisedPrompt = imageData.revised_prompt || prompt;

    if (!imageUrl) {
      throw new Error("DALL-E 3 returned no image URL");
    }

    // Baixar imagem
    const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
    const imageBuffer = Buffer.from(imageResponse.data);

    // Salvar localmente
    const filename = `dalle3-${crypto.randomBytes(16).toString("hex")}.png`;
    const localPath = await this.saveImage(imageBuffer, filename);

    const [width, height] = size.split("x").map(Number);

    // Gerar relative URL web-accessible
    const relativeUrl = `/kb_storage/generated_images/${filename}`;

    return {
      imageUrl: relativeUrl, // Use relative path para internal access
      localPath,
      provider: 'dalle3',
      success: true,
      revisedPrompt,
      width,
      height,
    };
  }

  /**
   * Salva imagem no kb_storage/generated_images
   */
  private async saveImage(imageBuffer: Buffer, filename: string): Promise<string> {
    await fs.mkdir(this.storageDir, { recursive: true });
    const localPath = path.join(this.storageDir, filename);
    await fs.writeFile(localPath, imageBuffer);
    return localPath;
  }

  /**
   * Verifica se tem quota disponível
   */
  private hasQuota(provider: 'pollinations'): boolean {
    return this.pollinationsQuota.used < this.pollinationsQuota.limit;
  }

  /**
   * Reset quotas a cada 24h
   */
  private resetQuotasIfNeeded(): void {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    if (now - this.pollinationsQuota.lastReset > dayInMs) {
      this.pollinationsQuota.used = 0;
      this.pollinationsQuota.lastReset = now;
      console.log("[ImageGenCascade] Quota Pollinations.ai resetada");
    }
  }

  /**
   * Retorna status das quotas
   */
  getQuotaStatus() {
    return {
      pollinations: {
        used: this.pollinationsQuota.used,
        limit: this.pollinationsQuota.limit,
        available: this.pollinationsQuota.limit - this.pollinationsQuota.used,
      },
    };
  }
}
