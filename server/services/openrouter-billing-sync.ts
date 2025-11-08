/**
 * OpenRouter Billing Sync Service
 * 
 * **FONTE DE VERDADE:**
 * - Endpoint: https://openrouter.ai/api/v1/activity
 * - Retorna dados REAIS de billing dos últimos 30 dias
 * - Formato 2025: flat structure (cada record = 1 modelo/dia)
 * 
 * **FORMATO 2025 (OFICIAL):**
 * ```json
 * {
 *   "data": [
 *     {
 *       "date": "2025-11-07",
 *       "model": "openai/gpt-4",
 *       "requests": 150,
 *       "prompt_tokens": 45000,
 *       "completion_tokens": 12000,
 *       "total_tokens": 57000,
 *       "cost": 1.23,
 *       "api_key_id": "key_abc123"
 *     }
 *   ]
 * }
 * ```
 * 
 * **BEST PRACTICES 2025:**
 * - Wait ~30min after UTC midnight before syncing previous day
 * - Reasoning models (o1, o3-mini) can take minutes to complete
 * - Activity logged by request START time
 * 
 * **FUNCIONALIDADES:**
 * - Busca custos reais via Activity API
 * - Salva no PostgreSQL (reutiliza tabela openai_billing_sync)
 * - Deduplicação automática
 * - Retry logic (429/503/504)
 * - Sync automático a cada 1 hora
 */

import { db } from "../db";
import { openai_billing_sync } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log as logger } from "../utils/logger"; // ✅ P2.1: Import correct logger export

class OpenRouterBillingSyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private apiKey: string | null = null;

  constructor() {
    // OpenRouter usa variáveis de ambiente específicas
    this.apiKey = process.env.OPEN_ROUTER_API_KEY || "";
    
    if (!this.apiKey) {
      logger.warn("[OpenRouter Billing Sync] ⚠️  OPEN_ROUTER_API_KEY não encontrada - sync desabilitado");
      return;
    }

    logger.info("[OpenRouter Billing Sync] ✅ Inicializado com OPEN_ROUTER_API_KEY");
  }

  /**
   * ✅ P2.1: Retry com exponential backoff (handles 429/503/504)
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Retry apenas em erros temporários
        const isRetryable = [429, 503, 504].includes(error.status);
        if (!isRetryable || attempt === maxRetries - 1) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delayMs = 1000 * Math.pow(2, attempt);
        logger.warn(`[OpenRouter Billing Sync] Retry ${attempt + 1}/${maxRetries} after ${delayMs}ms (status: ${error.status})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    throw lastError;
  }

  /**
   * ✅ P2.1: Truncate HTML errors (same as OpenAI service)
   */
  private truncateError(message: string, maxLength = 500): string {
    if (!message) return "Unknown error";
    
    // Se contém HTML, truncar drasticamente
    if (message.includes("<!DOCTYPE") || message.includes("<html")) {
      return `[HTML Error Response - truncated] ${message.substring(0, maxLength)}...`;
    }
    
    return message.length > maxLength 
      ? message.substring(0, maxLength) + "..." 
      : message;
  }

  /**
   * ✅ P2.1: Updated to 2025 API format + retry logic
   * 
   * **CHANGES FROM 2024:**
   * - 2024: `dayData.models` (array of models per day)
   * - 2025: Flat structure (each record = 1 model/day combination)
   */
  async syncBillingData(): Promise<void> {
    if (!this.apiKey) {
      logger.warn("[OpenRouter Billing Sync] Sync ignorado - API key não configurada");
      return;
    }

    try {
      logger.info("[OpenRouter Billing Sync] 🔄 Iniciando sync...");

      // ✅ P2.1: Fetch with retry logic
      const fetchActivity = async () => {
        const response = await fetch("https://openrouter.ai/api/v1/activity", {
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          }
        });

        if (!response.ok) {
          const error = await response.text();
          const truncated = this.truncateError(error);
          throw { status: response.status, message: truncated };
        }

        return await response.json();
      };

      const data = await this.retryWithBackoff(fetchActivity);

      // ✅ P2.1: Process 2025 format (flat structure)
      // Group by date first (since each record is per-model-per-day)
      const dailyData = new Map<string, { date: Date, models: any[], totalCost: number }>();

      for (const record of data.data || []) {
        const dateKey = record.date; // Already in YYYY-MM-DD format
        
        if (!dailyData.has(dateKey)) {
          dailyData.set(dateKey, {
            date: new Date(record.date),
            models: [],
            totalCost: 0
          });
        }

        const day = dailyData.get(dateKey)!;
        day.models.push({
          name: record.model || "Unknown",
          cost: record.cost || 0,
          tokens: record.total_tokens || 0,
          requests: record.requests || 0,
          prompt_tokens: record.prompt_tokens || 0,
          completion_tokens: record.completion_tokens || 0
        });
        day.totalCost += (record.cost || 0);
      }

      // Insert grouped daily records
      let syncedCount = 0;
      let skippedCount = 0;

      for (const [dateKey, dayData] of dailyData) {
        const periodKey = `openrouter-${dateKey}`;

        // Check if already exists
        const existing = await db
          .select()
          .from(openai_billing_sync)
          .where(eq(openai_billing_sync.periodKey, periodKey))
          .limit(1);

        if (existing.length > 0) {
          skippedCount++;
          continue;
        }

        // ✅ P1.4: Insert with provider='openrouter'
        await db.insert(openai_billing_sync).values({
          provider: "openrouter", // ✅ P1.4: Strict provider isolation
          startTime: dayData.date,
          endTime: new Date(dayData.date.getTime() + 86400000), // +1 dia
          totalCost: dayData.totalCost,
          lineItems: dayData.models,
          periodKey,
          source: "openrouter_activity_api_v2025" // ✅ P2.1: Updated source
        });

        syncedCount++;
      }

      logger.info(`[OpenRouter Billing Sync] ✅ Sync completo: ${syncedCount} novos registros, ${skippedCount} já existentes`);

    } catch (error: any) {
      const truncated = this.truncateError(error.message || String(error));
      logger.error(`[OpenRouter Billing Sync] ❌ Erro ao sincronizar: ${truncated}`);
      throw error;
    }
  }

  /**
   * Buscar custo total REAL dos últimos N dias (SOMENTE OpenRouter)
   * 
   * ✅ P1.4: Uses provider column for strict isolation
   */
  async getTotalCost(days: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { gte, and } = await import("drizzle-orm");

    // ✅ P1.4: Filter by provider column (strict, performant, safe)
    const result = await db
      .select()
      .from(openai_billing_sync)
      .where(
        and(
          eq(openai_billing_sync.provider, "openrouter"), // ✅ P1.4: Provider column (indexed!)
          gte(openai_billing_sync.startTime, cutoffDate)
        )
      );
    
    return result.reduce((sum, record) => sum + (record.totalCost || 0), 0);
  }

  /**
   * Agendar sync automático a cada 1 hora
   * 
   * ✅ P2.1: Updated with retry logic and proper logging
   */
  startAutoSync(): void {
    if (!this.apiKey) {
      logger.warn("[OpenRouter Billing Sync] Auto-sync desabilitado - API key não configurada");
      return;
    }

    // Sync imediato (with retry)
    this.syncBillingData().catch(err => {
      const truncated = this.truncateError(err.message || String(err));
      logger.error(`[OpenRouter Billing Sync] Erro no sync inicial: ${truncated}`);
    });

    // Agendar sync a cada 1 hora
    this.syncInterval = setInterval(() => {
      logger.info("[OpenRouter Billing Sync] ⏰ Executando sync automático...");
      this.syncBillingData().catch(err => {
        const truncated = this.truncateError(err.message || String(err));
        logger.error(`[OpenRouter Billing Sync] Erro no sync automático: ${truncated}`);
      });
    }, 60 * 60 * 1000);

    logger.info(`[OpenRouter Billing Sync] 📅 Auto-sync agendado (intervalo: 1 hora)`);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// Singleton
export const openRouterBillingSync = new OpenRouterBillingSyncService();
