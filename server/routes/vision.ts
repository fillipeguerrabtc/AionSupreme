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
  
  // REMOVED: Rate limiting already applied globally in routes.ts via app.use("/api", ...)
  // Keeping it here would cause double rate limiting (each request counted 2x)

  /**
   * GET /api/vision/providers
   * Retorna informações sobre os provedores configurados
   */
  app.get("/api/vision/providers", async (req: Request, res: Response) => {
    try {
      // Provider configuration (database in future, hardcoded for now with comment)
      // TODO: Move to database table 'vision_providers' for dynamic updates
      const providers = [
        {
          id: "gemini",
          name: "Google Gemini Vision",
          model: "gemini-2.0-flash-exp",
          tier: "FREE",
          dailyLimit: 1500,
          priority: 1,
          features: ["High quality", "Fast", "Detailed descriptions"],
          status: process.env.GEMINI_API_KEY ? "active" : "missing_key"
        },
        {
          id: "gpt4v-openrouter",
          name: "GPT-4 Vision (OpenRouter)",
          model: "openai/gpt-4-vision-preview:free",
          tier: "FREE",
          dailyLimit: 50,
          priority: 2,
          features: ["Good quality", "OpenRouter free tier"],
          status: process.env.OPEN_ROUTER_API_KEY ? "active" : "missing_key"
        },
        {
          id: "claude3-openrouter",
          name: "Claude 3 Haiku (OpenRouter)",
          model: "anthropic/claude-3-haiku:free",
          tier: "FREE",
          dailyLimit: 50,
          priority: 3,
          features: ["Good quality", "Fast", "OpenRouter free tier"],
          status: process.env.OPEN_ROUTER_API_KEY ? "active" : "missing_key"
        },
        {
          id: "huggingface",
          name: "HuggingFace BLIP",
          model: "Salesforce/blip-image-captioning-large",
          tier: "FREE",
          dailyLimit: 720,
          priority: 4,
          features: ["Basic captions", "Free"],
          status: process.env.HUGGINGFACE_API_KEY ? "active" : "missing_key"
        },
        {
          id: "openai",
          name: "OpenAI GPT-4o Vision",
          model: "gpt-4o",
          tier: "PAID",
          dailyLimit: null,
          priority: 5,
          features: ["Highest quality", "Unlimited", "Paid only"],
          status: process.env.OPENAI_API_KEY ? "active" : "missing_key"
        }
      ];

      res.json({
        success: true,
        data: providers,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("[Vision Routes] Error getting providers:", error);
      res.status(500).json({ error: error.message });
    }
  });

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

      // Criar imagem de teste simples (1x1 pixel PNG - blue/semi-transparent)
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

  console.log("[Vision Routes] ✅ 5 Vision System routes registered successfully");
}
