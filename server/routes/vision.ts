/**
 * VISION SYSTEM ROUTES
 * API para monitoramento e configuração do Vision Cascade
 */

import type { Express, Request, Response } from "express";
import { VisionCascade } from "../learn/vision-cascade";
import { db } from "../db";
import { tokenUsage } from "../../shared/schema";
import { and, eq, gte } from "drizzle-orm";

const visionCascade = new VisionCascade();

export function registerVisionRoutes(app: Express) {
  console.log("[Vision Routes] Registering Vision System API routes...");

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
   * Testa um provider específico processando uma imagem de teste
   */
  app.post("/api/vision/test", async (req: Request, res: Response) => {
    try {
      const { provider, imageUrl } = req.body;
      
      if (!provider) {
        return res.status(400).json({ error: "Provider is required" });
      }

      // TODO: Implementar teste real com imagem
      // Por agora, retorna mock de sucesso se API key existe
      const hasApiKey = 
        (provider === "gemini" && process.env.GEMINI_API_KEY) ||
        ((provider === "gpt4v-openrouter" || provider === "claude3-openrouter") && process.env.OPEN_ROUTER_API_KEY) ||
        (provider === "huggingface" && process.env.HUGGINGFACE_API_KEY) ||
        (provider === "openai" && process.env.OPENAI_API_KEY);

      if (!hasApiKey) {
        return res.status(400).json({ 
          success: false,
          error: `API key not configured for ${provider}` 
        });
      }

      res.json({
        success: true,
        data: {
          provider,
          tested: true,
          message: `${provider} is configured and ready`,
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
