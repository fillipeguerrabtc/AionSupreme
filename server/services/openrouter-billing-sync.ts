/**
 * OpenRouter Billing Sync Service
 * 
 * **FONTE DE VERDADE:**
 * - Endpoint: https://openrouter.ai/api/v1/activity
 * - Retorna dados REAIS de billing dos últimos 30 dias
 * - Inclui token usage, costs, e model breakdown
 * 
 * **FUNCIONALIDADES:**
 * - Busca custos reais via Activity API
 * - Salva no PostgreSQL (reutiliza tabela openai_billing_sync)
 * - Deduplicação automática
 * - Sync automático a cada 1 hora
 */

import { db } from "../db";
import { openai_billing_sync } from "@shared/schema";
import { eq } from "drizzle-orm";

class OpenRouterBillingSyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private apiKey: string | null = null;

  constructor() {
    // OpenRouter usa variáveis de ambiente específicas
    this.apiKey = process.env.OPEN_ROUTER_API_KEY || "";
    
    if (!this.apiKey) {
      console.warn("[OpenRouter Billing Sync] ⚠️  OPEN_ROUTER_API_KEY não encontrada - sync desabilitado");
      return;
    }

    console.log("[OpenRouter Billing Sync] ✅ Inicializado com OPEN_ROUTER_API_KEY");
  }

  /**
   * Busca dados REAIS de billing da OpenRouter Activity API
   */
  async syncBillingData(): Promise<void> {
    if (!this.apiKey) {
      console.warn("[OpenRouter Billing Sync] Sync ignorado - API key não configurada");
      return;
    }

    try {
      console.log("[OpenRouter Billing Sync] 🔄 Iniciando sync...");

      // Chamar OpenRouter Activity API
      const response = await fetch("https://openrouter.ai/api/v1/activity", {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter Activity API error (${response.status}): ${error}`);
      }

      const data = await response.json();

      // Processar dados diários (últimos 30 dias)
      let syncedCount = 0;
      let skippedCount = 0;

      for (const dayData of data.data || []) {
        const date = new Date(dayData.date);
        const periodKey = `openrouter-${date.toISOString().split('T')[0]}`;

        // Verificar se já existe
        const existing = await db
          .select()
          .from(openai_billing_sync)
          .where(eq(openai_billing_sync.periodKey, periodKey))
          .limit(1);

        if (existing.length > 0) {
          skippedCount++;
          continue;
        }

        // Calcular custo total do dia (somando todos os modelos)
        const totalCost = dayData.models?.reduce((sum: number, model: any) => {
          return sum + (model.cost || 0);
        }, 0) || 0;

        // Extrair line items (por modelo)
        const lineItems = (dayData.models || []).map((model: any) => ({
          name: model.model_id || "Unknown",
          cost: model.cost || 0,
          tokens: model.tokens || 0
        }));

        // Salvar no banco
        await db.insert(openai_billing_sync).values({
          tenantId: 1,
          startTime: date,
          endTime: new Date(date.getTime() + 86400000), // +1 dia
          totalCost,
          lineItems,
          periodKey,
          source: "openrouter_activity_api"
        });

        syncedCount++;
      }

      console.log(`[OpenRouter Billing Sync] ✅ Sync completo: ${syncedCount} novos registros, ${skippedCount} já existentes`);

    } catch (error: any) {
      console.error(`[OpenRouter Billing Sync] ❌ Erro ao sincronizar:`, error.message);
      throw error;
    }
  }

  /**
   * Buscar custo total REAL dos últimos N dias
   */
  async getTotalCost(days: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await db
      .select()
      .from(openai_billing_sync)
      .where(eq(openai_billing_sync.tenantId, 1));

    // Filtrar apenas registros do OpenRouter
    const openrouterRecords = result.filter(r => 
      r.source === "openrouter_activity_api" && 
      new Date(r.startTime) >= cutoffDate
    );
    
    return openrouterRecords.reduce((sum, record) => sum + (record.totalCost || 0), 0);
  }

  /**
   * Agendar sync automático a cada 1 hora
   */
  startAutoSync(): void {
    if (!this.apiKey) {
      console.warn("[OpenRouter Billing Sync] Auto-sync desabilitado - API key não configurada");
      return;
    }

    // Sync imediato
    this.syncBillingData().catch(err => {
      console.error("[OpenRouter Billing Sync] Erro no sync inicial:", err.message);
    });

    // Agendar sync a cada 1 hora
    this.syncInterval = setInterval(() => {
      console.log("[OpenRouter Billing Sync] ⏰ Executando sync automático...");
      this.syncBillingData().catch(err => {
        console.error("[OpenRouter Billing Sync] Erro no sync automático:", err.message);
      });
    }, 60 * 60 * 1000);

    console.log(`[OpenRouter Billing Sync] 📅 Auto-sync agendado (intervalo: 1 hora)`);
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
