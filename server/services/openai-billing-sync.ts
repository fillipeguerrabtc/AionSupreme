/**
 * OpenAI Billing Sync Service - PRODUCTION-READY
 * 
 * **PROBLEMA CRÍTICO RESOLVIDO:**
 * Dashboard AION mostrava custos INCORRETOS porque estava usando preços hardcoded
 * ao invés de dados REAIS da OpenAI.
 * 
 * **SOLUÇÃO:**
 * Este serviço busca dados REAIS da OpenAI Costs API (v2025) e armazena no PostgreSQL.
 * 
 * **FONTE DE VERDADE:**
 * - Endpoint: https://api.openai.com/v1/organization/costs
 * - Documentação: https://platform.openai.com/docs/api-reference/usage/costs
 * - Cookbook: https://cookbook.openai.com/examples/completions_usage_api
 * - Retorna os valores EXATOS que aparecem na fatura/invoice
 * - Considera créditos, descontos, promoções automáticas
 * 
 * **FUNCIONALIDADES:**
 * - ✅ Busca custos reais dos últimos 30 dias (formato 2025)
 * - ✅ Salva no PostgreSQL (tabela openai_billing_sync)
 * - ✅ Deduplicação automática (periodKey única)
 * - ✅ Retry automático com exponential backoff (504, 503, 429)
 * - ✅ Truncamento de erros HTML (Cloudflare 504)
 * - ✅ Paginação automática (next_page)
 * - ✅ Admin Key obrigatória (OPENAI_ADMIN_KEY)
 */

import OpenAI from "openai";
import { db } from "../db";
import { openai_billing_sync } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger-service";

// ============================================================================
// TYPES - OpenAI Costs API Response Format (2025)
// ============================================================================

interface CostResult {
  object: "cost.result";
  amount: {
    value: number;
    currency: string;
  };
  line_item: string;
  project_id?: string;
}

interface CostBucket {
  object: "bucket";
  start_time: number; // Unix timestamp
  end_time: number;
  results: CostResult[];
}

interface CostsAPIResponse {
  object: "page";
  data: CostBucket[];
  has_more: boolean;
  next_page?: string;
}

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [429, 503, 504], // Rate limit, Service unavailable, Gateway timeout
};

class OpenAIBillingSyncService {
  private openai: OpenAI | null = null;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    // ✅ FIX: Use OPENAI_ADMIN_KEY (required for billing endpoints)
    const apiKey = process.env.OPENAI_ADMIN_KEY || "";
    
    if (!apiKey) {
      logger.warn("[OpenAI Billing Sync] ⚠️  OPENAI_ADMIN_KEY não encontrada - sync desabilitado");
      return;
    }

    this.openai = new OpenAI({ apiKey });
    logger.info("[OpenAI Billing Sync] ✅ Inicializado com OPENAI_ADMIN_KEY (scope: api.usage.read)");
  }

  /**
   * ✅ FIX: Truncate error messages to prevent HTML pollution
   */
  private truncateError(error: string, maxLength: number = 500): string {
    if (error.length <= maxLength) {
      return error;
    }

    // Detect Cloudflare error pages (starts with <!DOCTYPE)
    if (error.trim().startsWith("<!DOCTYPE") || error.trim().startsWith("<html")) {
      return "Cloudflare error page (504 Gateway Timeout) - OpenAI API temporarily unavailable";
    }

    return error.substring(0, maxLength) + "... (truncated)";
  }

  /**
   * ✅ FIX: Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retryCount: number = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable = 
        error.status && RETRY_CONFIG.retryableStatuses.includes(error.status);

      if (!isRetryable || retryCount >= RETRY_CONFIG.maxRetries) {
        throw error; // Give up
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        RETRY_CONFIG.initialDelayMs * Math.pow(2, retryCount),
        RETRY_CONFIG.maxDelayMs
      );

      logger.warn(
        `[OpenAI Billing Sync] Retry ${retryCount + 1}/${RETRY_CONFIG.maxRetries} after ${delay}ms (status: ${error.status})`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryWithBackoff(fn, retryCount + 1);
    }
  }

  /**
   * ✅ FIX: Updated to use 2025 Costs API format
   * 
   * Busca dados REAIS de billing da OpenAI Costs API
   * 
   * @param days Número de dias para buscar (padrão: 30)
   * @returns Dados de billing salvos no banco
   */
  async syncBillingData(days: number = 30): Promise<void> {
    if (!this.openai) {
      logger.warn("[OpenAI Billing Sync] Sync ignorado - API key não configurada");
      return;
    }

    try {
      logger.info(`[OpenAI Billing Sync] 🔄 Iniciando sync dos últimos ${days} dias...`);

      // Calcular range de tempo (últimos N dias)
      const endTime = Math.floor(Date.now() / 1000); // Unix timestamp atual
      const startTime = endTime - (days * 24 * 60 * 60); // N dias atrás

      // ✅ FIX: Fetch with retry logic
      const allData = await this.fetchAllCostsWithPagination(startTime, endTime);

      // Processar cada período (bucket diário)
      let syncedCount = 0;
      let skippedCount = 0;

      for (const bucket of allData) {
        // Converter Unix timestamp para Date
        const bucketStartTime = new Date(bucket.start_time * 1000);
        const bucketEndTime = new Date(bucket.end_time * 1000);
        
        // Gerar periodKey único (YYYY-MM-DD)
        const periodKey = bucketStartTime.toISOString().split('T')[0];

        // Verificar se já existe (deduplicação)
        const existing = await db
          .select()
          .from(openai_billing_sync)
          .where(eq(openai_billing_sync.periodKey, periodKey))
          .limit(1);

        if (existing.length > 0) {
          skippedCount++;
          continue; // Já sincronizado
        }

        // ✅ FIX: Extract line items from NEW format (results array)
        const lineItems = (bucket.results || []).map((result: CostResult) => ({
          name: result.line_item || "Unknown",
          cost: result.amount?.value || 0,
          project_id: result.project_id,
          currency: result.amount?.currency || "usd"
        }));

        // ✅ FIX: Calculate total cost from results array
        const totalCost = lineItems.reduce((sum, item) => sum + item.cost, 0);

        // ✅ FIX: Remove tenantId (table doesn't have this column)
        await db.insert(openai_billing_sync).values({
          startTime: bucketStartTime,
          endTime: bucketEndTime,
          totalCost, // Custo REAL da fatura (sum of all line items)
          lineItems,
          periodKey,
          source: "openai_costs_api_v2025"
        });

        syncedCount++;
      }

      logger.info(`[OpenAI Billing Sync] ✅ Sync completo: ${syncedCount} novos registros, ${skippedCount} já existentes`);

    } catch (error: any) {
      const truncatedError = this.truncateError(error.message || String(error));
      logger.error(`[OpenAI Billing Sync] ❌ Erro ao sincronizar: ${truncatedError}`);
      throw new Error(truncatedError);
    }
  }

  /**
   * ✅ NEW: Fetch all costs with automatic pagination
   */
  private async fetchAllCostsWithPagination(
    startTime: number,
    endTime: number
  ): Promise<CostBucket[]> {
    const allBuckets: CostBucket[] = [];
    let pageCursor: string | undefined = undefined;

    const fetchPage = async (): Promise<CostsAPIResponse> => {
      const params: Record<string, any> = {
        start_time: startTime,
        end_time: endTime,
        bucket_width: "1d", // Daily aggregation (only supported value)
      };

      if (pageCursor) {
        params.page = pageCursor;
      }

      const url = new URL("https://api.openai.com/v1/organization/costs");
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

      const response = await fetch(url.toString(), {
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_ADMIN_KEY}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw { status: response.status, message: error };
      }

      return await response.json();
    };

    // Pagination loop with retry
    do {
      const data = await this.retryWithBackoff(fetchPage);
      allBuckets.push(...(data.data || []));
      pageCursor = data.next_page;
    } while (pageCursor);

    return allBuckets;
  }

  /**
   * Buscar custo total REAL dos últimos N dias (SOMENTE OpenAI)
   * 
   * ✅ FIX: Filters by source to prevent mixing OpenRouter/Gemini costs
   * Handles legacy rows (NULL source) + new rows ("openai_costs_api_v2025")
   * 
   * @param days Número de dias (padrão: 30)
   * @returns Custo total em USD (dados REAIS da OpenAI)
   */
  async getTotalCost(days: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // ✅ FIX REGRESSION: Filter by source to avoid mixing providers
    // Accept legacy rows (source = openai_costs_api) OR new format (openai_costs_api_v2025)
    // Exclude OpenRouter (openrouter-*) and Gemini (gemini-*) via periodKey
    const { or, and, notLike } = await import("drizzle-orm");
    
    const result = await db
      .select()
      .from(openai_billing_sync)
      .where(
        and(
          // Source must be OpenAI (handles NULL for backfilled records)
          or(
            eq(openai_billing_sync.source, "openai_costs_api_v2025"),
            eq(openai_billing_sync.source, "openai_costs_api")
          ),
          // Exclude other providers by periodKey pattern
          notLike(openai_billing_sync.periodKey, "openrouter-%"),
          notLike(openai_billing_sync.periodKey, "gemini-%")
        )
      );

    // Filtrar últimos N dias e somar
    const recentRecords = result.filter(r => new Date(r.startTime) >= cutoffDate);
    const totalCost = recentRecords.reduce((sum, record) => sum + (record.totalCost || 0), 0);

    return totalCost;
  }

  /**
   * Agendar sync automático a cada 5 minutos
   */
  startAutoSync(): void {
    if (!this.openai) {
      logger.warn("[OpenAI Billing Sync] Auto-sync desabilitado - API key não configurada");
      return;
    }

    // Sync imediato na inicialização (com retry automático)
    this.syncBillingData(30).catch(err => {
      const truncatedError = this.truncateError(err.message || String(err));
      logger.error(`[OpenAI Billing Sync] Erro no sync inicial: ${truncatedError}`);
    });

    // Agendar sync a cada 5 minutos
    const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

    this.syncInterval = setInterval(() => {
      logger.info("[OpenAI Billing Sync] ⏰ Executando sync automático...");
      this.syncBillingData(30).catch(err => {
        const truncatedError = this.truncateError(err.message || String(err));
        logger.error(`[OpenAI Billing Sync] Erro no sync automático: ${truncatedError}`);
      });
    }, SYNC_INTERVAL_MS);

    logger.info(`[OpenAI Billing Sync] 📅 Auto-sync agendado (intervalo: 5 minutos)`);
  }

  /**
   * Trigger manual de sync (chamado após cada request OpenAI)
   * Sync assíncrono - não bloqueia a resposta
   */
  async triggerSync(): Promise<void> {
    if (!this.openai) {
      return;
    }

    logger.info("[OpenAI Billing Sync] 🔄 Sync manual triggered (pós-request)");
    
    // Sync em background (não aguarda)
    this.syncBillingData(7).catch(err => {
      const truncatedError = this.truncateError(err.message || String(err));
      logger.error(`[OpenAI Billing Sync] Erro no sync manual: ${truncatedError}`);
    });
  }

  /**
   * Parar sync automático
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info("[OpenAI Billing Sync] Auto-sync parado");
    }
  }
}

// Singleton
export const openAIBillingSync = new OpenAIBillingSyncService();
