/**
 * IMAGE GENERATION CASCADE - Sistema de fallback automático para geração de imagens
 * 
 * Cascata de prioridade (GPU-First → Free → Paid):
 * 1. SD-XL GPU Workers (AION GPU Pool - 100% LOCAL, zero cost per image)
 * 2. Pollinations.ai (TOTALMENTE GRÁTIS, sem API key, ilimitado)
 * 3. OpenAI DALL-E 3 (PAGO - último recurso)
 * 
 * GPU-First Architecture:
 * - Prioriza workers locais Stable Diffusion XL
 * - Auto-discovery via GPU Pool System
 * - Healthcheck e load balancing automáticos
 * - Fallback para APIs externas se GPU indisponível
 */

import OpenAI from "openai";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { db } from "../db";
import { gpuWorkers } from "../db/schema";
import { eq } from "drizzle-orm";

export type ImageGenProvider = 'sd-xl-gpu' | 'pollinations' | 'dalle3' | 'none';

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
  
  // GPU Worker cache (updated every 30s)
  private gpuWorkerCache: Array<{ id: number; endpoint: string; }> = [];
  private lastGPUCacheUpdate = 0;

  constructor() {
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.storageDir = path.join(process.cwd(), "kb_storage", "generated_images");
  }

  /**
   * Auto-discover active SD-XL GPU workers from GPU Pool
   */
  private async discoverGPUWorkers(): Promise<Array<{ id: number; endpoint: string; }>> {
    const now = Date.now();
    
    // Cache por 30s para evitar queries excessivas
    if (now - this.lastGPUCacheUpdate < 30000 && this.gpuWorkerCache.length > 0) {
      return this.gpuWorkerCache;
    }
    
    try {
      // Query workers ativos com capability "text2img"
      const workers = await db.select({
        id: gpuWorkers.id,
        endpoint: gpuWorkers.endpoint,
      })
      .from(gpuWorkers)
      .where(eq(gpuWorkers.status, 'ready'))
      .execute();
      
      // Filter workers com endpoint válido
      const activeWorkers = workers.filter(w => w.endpoint && w.endpoint.startsWith('http'));
      
      this.gpuWorkerCache = activeWorkers;
      this.lastGPUCacheUpdate = now;
      
      console.log(`[ImageGenCascade] 🔍 Discovered ${activeWorkers.length} active GPU workers`);
      
      return activeWorkers;
    } catch (error: any) {
      console.warn(`[ImageGenCascade] ⚠️ Failed to discover GPU workers: ${error.message}`);
      return [];
    }
  }

  /**
   * Gera imagem usando cascade automático (GPU-First)
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

    // 🚀 PRIORITY 1: SD-XL GPU Workers (100% LOCAL, zero cost)
    const gpuWorkers = await this.discoverGPUWorkers();
    if (gpuWorkers.length > 0) {
      for (const worker of gpuWorkers) {
        try {
          const result = await this.trySDXL(worker.endpoint, prompt, size);
          console.log(`[ImageGenCascade] ✅ SD-XL GPU Worker ${worker.id} (${Date.now() - startTime}ms) - LOCAL & FREE`);
          return result;
        } catch (error: any) {
          console.warn(`[ImageGenCascade] ⚠️ SD-XL Worker ${worker.id} falhou: ${error.message}`);
          // Continue to next worker
        }
      }
      console.log(`[ImageGenCascade] ⚠️ All GPU workers failed, falling back to external APIs`);
    }

    // 2. Tenta Pollinations.ai (100% GRÁTIS, sem API key)
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

    // 3. Último recurso: DALL-E 3 (PAGO)
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
   * Tenta SD-XL GPU Worker (FastAPI endpoint)
   */
  private async trySDXL(endpoint: string, prompt: string, size: string): Promise<ImageGenResult> {
    const [width, height] = size.split("x").map(Number);
    
    console.log(`[SD-XL GPU] Generating image via ${endpoint}: "${prompt.slice(0, 60)}..."`);
    
    // Call FastAPI /generate/text2img endpoint
    const response = await axios.post(
      `${endpoint}/generate/text2img`,
      {
        prompt,
        width,
        height,
        num_inference_steps: 30,
        guidance_scale: 7.5,
        num_images: 1,
      },
      {
        timeout: 120000, // 2 min timeout (GPU generation takes time)
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.data || !response.data.success || !response.data.images || response.data.images.length === 0) {
      throw new Error("SD-XL worker returned invalid response");
    }

    const imageData = response.data.images[0];
    
    // Decode base64 image
    const imageBuffer = Buffer.from(imageData.base64, 'base64');
    
    // Save locally
    const filename = `sd-xl-${crypto.randomBytes(16).toString("hex")}.png`;
    const localPath = await this.saveImage(imageBuffer, filename);
    
    // Generate relative URL
    const relativeUrl = `/kb_storage/generated_images/${filename}`;

    return {
      imageUrl: relativeUrl,
      localPath,
      provider: 'sd-xl-gpu',
      success: true,
      width: imageData.width || width,
      height: imageData.height || height,
    };
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
   * Retorna status das quotas e GPU workers
   */
  async getQuotaStatus() {
    const gpuWorkers = await this.discoverGPUWorkers();
    
    return {
      gpuWorkers: {
        count: gpuWorkers.length,
        available: gpuWorkers.length > 0,
        endpoints: gpuWorkers.map(w => w.endpoint),
      },
      pollinations: {
        used: this.pollinationsQuota.used,
        limit: this.pollinationsQuota.limit,
        available: this.pollinationsQuota.limit - this.pollinationsQuota.used,
      },
      cascade: {
        priority: [
          gpuWorkers.length > 0 ? 'SD-XL GPU (LOCAL & FREE)' : null,
          'Pollinations.ai (FREE)',
          'DALL-E 3 (PAID)'
        ].filter(Boolean)
      }
    };
  }
}
