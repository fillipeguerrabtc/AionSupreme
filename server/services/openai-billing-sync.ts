/**
 * OpenAI Billing Sync Service
 * 
 * **PROBLEMA CRÍTICO RESOLVIDO:**
 * Dashboard AION mostrava custos INCORRETOS (100x maior que a realidade!)
 * porque estava usando preços hardcoded ao invés de dados REAIS da OpenAI.
 * 
 * **SOLUÇÃO:**
 * Este serviço busca dados REAIS da OpenAI Costs API e armazena no PostgreSQL.
 * 
 * **FONTE DE VERDADE:**
 * - Endpoint: https://api.openai.com/v1/organization/costs
 * - Retorna os valores EXATOS que aparecem na fatura/invoice
 * - Considera créditos, descontos, promoções automáticas
 * - É a ÚNICA fonte confiável para billing
 * 
 * **FUNCIONALIDADES:**
 * - Busca custos reais dos últimos 30 dias
 * - Salva no PostgreSQL (tabela openai_billing_sync)
 * - Deduplicação automática (periodKey única)
 * - Agenda sync automático a cada 1 hora
 * - Fallback gracioso se API falhar
 */

import OpenAI from "openai";
import { db } from "../db";
import { openai_billing_sync } from "@shared/schema";
import { eq } from "drizzle-orm";

class OpenAIBillingSyncService {
  private openai: OpenAI | null = null;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Usar OPENAI_ADMIN_KEY que tem scope api.usage.read para billing
    const apiKey = process.env.OPENAI_ADMIN_KEY || "";
    
    if (!apiKey) {
      console.warn("[OpenAI Billing Sync] ⚠️  OPENAI_ADMIN_KEY não encontrada - sync desabilitado");
      return;
    }

    this.openai = new OpenAI({ apiKey });
    console.log("[OpenAI Billing Sync] ✅ Inicializado com OPENAI_ADMIN_KEY (scope: api.usage.read)");
  }

  /**
   * Busca dados REAIS de billing da OpenAI Costs API
   * 
   * @param days Número de dias para buscar (padrão: 30)
   * @returns Dados de billing salvos no banco
   */
  async syncBillingData(days: number = 30): Promise<void> {
    if (!this.openai) {
      console.warn("[OpenAI Billing Sync] Sync ignorado - API key não configurada");
      return;
    }

    try {
      console.log(`[OpenAI Billing Sync] 🔄 Iniciando sync dos últimos ${days} dias...`);

      // Calcular range de tempo (últimos N dias)
      const endTime = Math.floor(Date.now() / 1000); // Unix timestamp atual
      const startTime = endTime - (days * 24 * 60 * 60); // N dias atrás

      // Chamar OpenAI Costs API (fonte de verdade!)
      // Docs: https://platform.openai.com/docs/api-reference/usage
      const response = await fetch(
        `https://api.openai.com/v1/organization/costs?start_time=${startTime}&bucket_width=1d&limit=${days}`,
        {
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_ADMIN_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI Costs API error (${response.status}): ${error}`);
      }

      const data = await response.json();

      // Processar cada período (bucket diário)
      let syncedCount = 0;
      let skippedCount = 0;

      for (const bucket of data.data || []) {
        // Converter Unix timestamp para Date
        const bucketStartTime = new Date(bucket.start_time * 1000);
        const bucketEndTime = new Date((bucket.start_time + 86400) * 1000); // +1 dia
        
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

        // Extrair line items (detalhamento de custos)
        const lineItems = (bucket.line_items || []).map((item: any) => ({
          name: item.name || "Unknown",
          cost: item.cost || 0,
          project_id: item.project_id,
          line_item: item.line_item
        }));

        // Salvar no banco
        await db.insert(openai_billing_sync).values({
          tenantId: 1,
          startTime: bucketStartTime,
          endTime: bucketEndTime,
          totalCost: bucket.amount || 0, // Custo REAL da fatura
          lineItems,
          periodKey,
          source: "openai_costs_api"
        });

        syncedCount++;
      }

      console.log(`[OpenAI Billing Sync] ✅ Sync completo: ${syncedCount} novos registros, ${skippedCount} já existentes`);

    } catch (error: any) {
      console.error(`[OpenAI Billing Sync] ❌ Erro ao sincronizar:`, error.message);
      throw error;
    }
  }

  /**
   * Buscar custo total REAL dos últimos N dias
   * 
   * @param days Número de dias (padrão: 30)
   * @returns Custo total em USD (dados REAIS da OpenAI)
   */
  async getTotalCost(days: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await db
      .select()
      .from(openai_billing_sync)
      .where(eq(openai_billing_sync.tenantId, 1));

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
      console.warn("[OpenAI Billing Sync] Auto-sync desabilitado - API key não configurada");
      return;
    }

    // Sync imediato na inicialização
    this.syncBillingData(30).catch(err => {
      console.error("[OpenAI Billing Sync] Erro no sync inicial:", err.message);
    });

    // Agendar sync a cada 5 minutos (ao invés de 1 hora)
    const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

    this.syncInterval = setInterval(() => {
      console.log("[OpenAI Billing Sync] ⏰ Executando sync automático...");
      this.syncBillingData(30).catch(err => {
        console.error("[OpenAI Billing Sync] Erro no sync automático:", err.message);
      });
    }, SYNC_INTERVAL_MS);

    console.log(`[OpenAI Billing Sync] 📅 Auto-sync agendado (intervalo: 5 minutos)`);
  }

  /**
   * Trigger manual de sync (chamado após cada request OpenAI)
   * Sync assíncrono - não bloqueia a resposta
   */
  async triggerSync(): Promise<void> {
    if (!this.openai) {
      return;
    }

    console.log("[OpenAI Billing Sync] 🔄 Sync manual triggered (pós-request)");
    
    // Sync em background (não aguarda)
    this.syncBillingData(7).catch(err => {
      console.error("[OpenAI Billing Sync] Erro no sync manual:", err.message);
    });
  }

  /**
   * Parar sync automático
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log("[OpenAI Billing Sync] Auto-sync parado");
    }
  }
}

// Singleton
export const openAIBillingSync = new OpenAIBillingSyncService();
