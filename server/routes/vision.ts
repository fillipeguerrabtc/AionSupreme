/**
 * VISION SYSTEM ROUTES
 * API para monitoramento e configuração do Vision Cascade
 */

import type { Express, Request, Response } from "express";
import { VisionCascade } from "../learn/vision-cascade";
import { db } from "../db";
import { tokenUsage } from "../../shared/schema";
import { and, eq, gte } from "drizzle-orm";
import { rateLimitMiddleware } from "../middleware/rate-limit";

const visionCascade = new VisionCascade();

export function registerVisionRoutes(app: Express) {
  console.log("[Vision Routes] Registering Vision System API routes...");
  
  // Apply rate limiting to all Vision routes
  app.use("/api/vision/*", rateLimitMiddleware);

  /**
   * GET /api/vision/status
   * Retorna status atual das quotas de todos os provedores
   */
  app.get("/api/vision/status", async (req: Request, res: Response) => {
    try {
      const status = visionCascade.getQuotaStatus();
      
      res.json({
        success: true,
        data: status,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("[Vision Routes] Error getting quota status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/vision/quota-history
   * Retorna histórico de uso das quotas dos últimos 7 dias
   */
  app.get("/api/vision/quota-history", async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Buscar dados de uso por provider
      const usage = await db
        .select()
        .from(tokenUsage)
        .where(
          and(
            eq(tokenUsage.requestType, "image"),
            gte(tokenUsage.timestamp, startDate)
          )
        )
        .orderBy(tokenUsage.timestamp);

      // Agregar por provider
      const stats = usage.reduce((acc, record) => {
        const provider = record.provider;
        if (!acc[provider]) {
          acc[provider] = {
            provider,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalTokens: 0,
            totalCost: 0,
            models: new Set()
          };
        }

        acc[provider].totalRequests++;
        if (record.success) {
          acc[provider].successfulRequests++;
        } else {
          acc[provider].failedRequests++;
        }
        acc[provider].totalTokens += record.totalTokens || 0;
        acc[provider].totalCost += record.cost || 0;
        acc[provider].models.add(record.model);

        return acc;
      }, {} as any);

      // Converter Sets para arrays
      Object.values(stats).forEach((stat: any) => {
        stat.models = Array.from(stat.models);
        stat.successRate = stat.totalRequests > 0 
          ? (stat.successfulRequests / stat.totalRequests) * 100 
          : 0;
      });

      res.json({
        success: true,
        data: {
          period: { days, startDate, endDate: new Date() },
          providers: stats,
          totalRecords: usage.length
        }
      });
    } catch (error: any) {
      console.error("[Vision Routes] Error getting usage stats:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/vision/test
   * Testa um provider específico processando uma imagem de teste REAL
   */
  app.post("/api/vision/test", async (req: Request, res: Response) => {
    try {
      const { provider } = req.body;
      
      if (!provider) {
        return res.status(400).json({ error: "Provider is required" });
      }

      // Validar provider
      const validProviders: Array<'gemini' | 'gpt4v-openrouter' | 'claude3-openrouter' | 'huggingface' | 'openai'> = 
        ['gemini', 'gpt4v-openrouter', 'claude3-openrouter', 'huggingface', 'openai'];
      
      if (!validProviders.includes(provider)) {
        return res.status(400).json({ 
          error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` 
        });
      }

      // Criar imagem de teste simples (1x1 pixel PNG vermelho)
      const testImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
      const testImageBuffer = Buffer.from(testImageBase64, 'base64');
      const testMimeType = "image/png";

      console.log(`[Vision Test] Testing provider: ${provider}`);
      
      // Executar teste REAL com o Vision Cascade
      const startTime = Date.now();
      let result;
      let error = null;

      try {
        // Force o provider específico criando instância temporária
        // Como VisionCascade sempre tenta em ordem, precisamos testar diretamente
        const testMethods: Record<typeof provider, () => Promise<any>> = {
          'gemini': () => (visionCascade as any).tryGemini(testImageBuffer, testMimeType, "test image"),
          'gpt4v-openrouter': () => (visionCascade as any).tryGPT4VOpenRouter(testImageBuffer, testMimeType, "test image"),
          'claude3-openrouter': () => (visionCascade as any).tryClaude3OpenRouter(testImageBuffer, testMimeType, "test image"),
          'huggingface': () => (visionCascade as any).tryHuggingFace(testImageBuffer, "test image"),
          'openai': () => (visionCascade as any).tryOpenAI(testImageBuffer, testMimeType, "test image")
        };

        result = await testMethods[provider as keyof typeof testMethods]();
      } catch (err: any) {
        error = err.message;
        console.error(`[Vision Test] ${provider} failed:`, err.message);
      }

      const latency = Date.now() - startTime;

      if (error || !result?.success) {
        return res.status(400).json({
          success: false,
          error: error || "Provider test failed",
          provider,
          latency,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: {
          provider,
          tested: true,
          description: result.description,
          tokensUsed: result.tokensUsed,
          latency,
          message: `${provider} test completed successfully`,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error("[Vision Routes] Error testing provider:", error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[Vision Routes] ✅ 4 Vision System routes registered successfully");
}
