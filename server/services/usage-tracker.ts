/**
 * Sistema de Rastreamento de Uso de Agentes e Namespaces (PRODUCTION-READY)
 * 
 * ✅ MIGRADO PARA POSTGRESQL - Persistência completa
 * ✅ ZERO dados em memória - tudo salvo no banco
 * 
 * Registra automaticamente:
 * - Uso de agentes (quantas vezes cada agente foi acionado)
 * - Uso de namespaces (quantas buscas na KB por namespace)
 * - Histórico temporal (últimas 30 dias)
 * - Rankings (mais/menos usados)
 */

import { storage } from "../storage";

interface UsageStats {
  entityId: string;
  entityName: string;
  totalUses: number;
  lastUsed: number;
  uses24h: number;
  uses7d: number;
  uses30d: number;
  
  // Hierarquia
  agentTier?: "agent" | "subagent" | null;
  parentAgentId?: string | null;
  isRootNamespace?: boolean | null;
  parentNamespace?: string | null;
  subEntitiesCount?: number;
}

interface TimeSeriesData {
  date: string; // YYYY-MM-DD
  count: number;
}

interface NamespaceQualityStats {
  namespace: string;
  searchCount: number;
  avgRelevance: number;
  minRelevance: number;
  maxRelevance: number;
}

class UsageTracker {
  /**
   * Registra uso de um agente (com hierarquia) - PRODUCTION-READY PostgreSQL
   */
  async trackAgentUse(
    agentId: string,
    agentName: string,
    operation: "query" | "search" | "generation" | "tool_use",
    metadata?: Record<string, any>,
    agentTier?: "agent" | "subagent",
    parentAgentId?: string
  ): Promise<void> {
    try {
      await storage.createUsageRecord({
        entityType: "agent",
        entityId: agentId,
        entityName: agentName,
        operation,
        metadata,
        agentTier: agentTier || null,
        parentAgentId: parentAgentId || null,
        isRootNamespace: null,
        parentNamespace: null,
      });
    } catch (error) {
      console.error("[UsageTracker] Error tracking agent use:", error);
    }
  }
  
  /**
   * Registra busca em namespace (com hierarquia) - PRODUCTION-READY PostgreSQL
   */
  async trackNamespaceSearch(
    namespaceId: string,
    namespaceName: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Inferir hierarquia do namespace pelo nome
      const isRootNamespace = !namespaceName.includes("/");
      const parentNamespace = isRootNamespace
        ? null
        : namespaceName.split("/")[0];
      
      await storage.createUsageRecord({
        entityType: "namespace",
        entityId: namespaceId,
        entityName: namespaceName,
        operation: "search",
        metadata,
        agentTier: null,
        parentAgentId: null,
        isRootNamespace,
        parentNamespace,
      });
    } catch (error) {
      console.error("[UsageTracker] Error tracking namespace search:", error);
    }
  }
  
  /**
   * Registra qualidade de resultados de busca RAG - PRODUCTION-READY PostgreSQL
   */
  async trackNamespaceSearchQuality(
    namespace: string,
    relevanceScores: number[]
  ): Promise<void> {
    if (relevanceScores.length === 0) return;
    
    try {
      const avgRelevanceScore = relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length;
      
      await storage.createNamespaceRelevanceRecord({
        namespace,
        avgRelevanceScore,
        resultCount: relevanceScores.length,
      });
    } catch (error) {
      console.error("[UsageTracker] Error tracking namespace search quality:", error);
    }
  }
  
  /**
   * Retorna estatísticas de qualidade por namespace (PRODUCTION-READY)
   * Calcula média REAL de relevance scores do PostgreSQL
   */
  async getNamespaceQualityStats(daysAgo: number = 30): Promise<NamespaceQualityStats[]> {
    try {
      const records = await storage.getNamespaceRelevanceRecords({ daysAgo });
      
      const grouped = new Map<string, number[]>();
      
      // Agrupar scores por namespace
      for (const record of records) {
        const existing = grouped.get(record.namespace) || [];
        existing.push(record.avgRelevanceScore);
        grouped.set(record.namespace, existing);
      }
      
      // Calcular estatísticas por namespace
      const stats: NamespaceQualityStats[] = [];
      
      for (const [namespace, scores] of Array.from(grouped.entries())) {
        const avgRelevance = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        const minRelevance = Math.min(...scores);
        const maxRelevance = Math.max(...scores);
        
        stats.push({
          namespace,
          searchCount: scores.length,
          avgRelevance,
          minRelevance,
          maxRelevance,
        });
      }
      
      return stats.sort((a, b) => b.avgRelevance - a.avgRelevance);
    } catch (error) {
      console.error("[UsageTracker] Error getting namespace quality stats:", error);
      return [];
    }
  }
  
  /**
   * Retorna estatísticas de uso de agentes - PRODUCTION-READY PostgreSQL
   */
  async getAgentStats(daysAgo: number = 30): Promise<UsageStats[]> {
    return this.calculateStats("agent", daysAgo);
  }
  
  /**
   * Retorna estatísticas de uso de namespaces - PRODUCTION-READY PostgreSQL
   */
  async getNamespaceStats(daysAgo: number = 30): Promise<UsageStats[]> {
    return this.calculateStats("namespace", daysAgo);
  }
  
  /**
   * Calcula estatísticas agregadas (com hierarquia) - PRODUCTION-READY PostgreSQL
   */
  private async calculateStats(entityType: "agent" | "namespace", daysAgo: number): Promise<UsageStats[]> {
    try {
      const records = await storage.getUsageRecords({ entityType, daysAgo });
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      
      // Agrupar por entityId
      const grouped = new Map<string, typeof records>();
      
      for (const record of records) {
        const existing = grouped.get(record.entityId) || [];
        existing.push(record);
        grouped.set(record.entityId, existing);
      }
      
      // Calcular estatísticas para cada entidade
      const stats: UsageStats[] = [];
      
      for (const [entityId, entityRecords] of Array.from(grouped.entries())) {
        const sortedRecords = entityRecords.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const lastUsed = new Date(sortedRecords[0]?.timestamp || 0).getTime();
        const mostRecent = sortedRecords[0];
        
        // Contar sub-entidades (se for agent pai ou namespace raiz)
        let subEntitiesCount = 0;
        
        if (entityType === "agent" && mostRecent.agentTier === "agent") {
          // Contar quantos sub-agents existem com este parentAgentId
          const subAgentIds = new Set(
            records.filter(r => r.parentAgentId === entityId).map(r => r.entityId)
          );
          subEntitiesCount = subAgentIds.size;
        } else if (entityType === "namespace" && mostRecent.isRootNamespace) {
          // Contar quantos sub-namespaces existem com este parent
          const subNamespaceIds = new Set(
            records.filter(r => r.parentNamespace === mostRecent.entityName).map(r => r.entityId)
          );
          subEntitiesCount = subNamespaceIds.size;
        }
        
        stats.push({
          entityId,
          entityName: mostRecent?.entityName || entityId,
          totalUses: entityRecords.length,
          lastUsed,
          uses24h: entityRecords.filter(r => now - new Date(r.timestamp).getTime() < day).length,
          uses7d: entityRecords.filter(r => now - new Date(r.timestamp).getTime() < 7 * day).length,
          uses30d: entityRecords.filter(r => now - new Date(r.timestamp).getTime() < 30 * day).length,
          
          // Hierarquia
          agentTier: mostRecent.agentTier,
          parentAgentId: mostRecent.parentAgentId,
          isRootNamespace: mostRecent.isRootNamespace,
          parentNamespace: mostRecent.parentNamespace,
          subEntitiesCount,
        });
      }
      
      // Ordenar por total de usos (decrescente)
      return stats.sort((a, b) => b.totalUses - a.totalUses);
    } catch (error) {
      console.error("[UsageTracker] Error calculating stats:", error);
      return [];
    }
  }
  
  /**
   * Retorna série temporal de uso de um agente específico - PRODUCTION-READY PostgreSQL
   */
  async getAgentTimeSeries(agentId: string, days: number = 30): Promise<TimeSeriesData[]> {
    return this.calculateTimeSeries("agent", agentId, days);
  }
  
  /**
   * Retorna série temporal de uso de um namespace específico - PRODUCTION-READY PostgreSQL
   */
  async getNamespaceTimeSeries(namespaceId: string, days: number = 30): Promise<TimeSeriesData[]> {
    return this.calculateTimeSeries("namespace", namespaceId, days);
  }
  
  /**
   * Retorna série temporal agregada de todos agentes - PRODUCTION-READY PostgreSQL
   */
  async getAllAgentsTimeSeries(days: number = 30): Promise<TimeSeriesData[]> {
    return this.calculateTimeSeries("agent", null, days);
  }
  
  /**
   * Retorna série temporal agregada de todos namespaces - PRODUCTION-READY PostgreSQL
   */
  async getAllNamespacesTimeSeries(days: number = 30): Promise<TimeSeriesData[]> {
    return this.calculateTimeSeries("namespace", null, days);
  }
  
  /**
   * Calcula série temporal (histórico diário) - PRODUCTION-READY PostgreSQL
   */
  private async calculateTimeSeries(
    entityType: "agent" | "namespace",
    entityId: string | null,
    days: number
  ): Promise<TimeSeriesData[]> {
    try {
      const filters: any = { entityType, daysAgo: days };
      if (entityId) {
        filters.entityId = entityId;
      }
      
      const records = await storage.getUsageRecords(filters);
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      
      // Agrupar por data
      const byDate = new Map<string, number>();
      
      for (const record of records) {
        const date = new Date(record.timestamp).toISOString().split("T")[0];
        byDate.set(date, (byDate.get(date) || 0) + 1);
      }
      
      // Gerar array de últimos N dias (mesmo sem dados)
      const result: TimeSeriesData[] = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now - i * dayMs).toISOString().split("T")[0];
        result.push({
          date,
          count: byDate.get(date) || 0,
        });
      }
      
      return result;
    } catch (error) {
      console.error("[UsageTracker] Error calculating time series:", error);
      return [];
    }
  }
  
  /**
   * Retorna top N agentes mais usados - PRODUCTION-READY PostgreSQL
   */
  async getTopAgents(limit: number = 10, daysAgo: number = 30): Promise<UsageStats[]> {
    const stats = await this.getAgentStats(daysAgo);
    return stats.slice(0, limit);
  }
  
  /**
   * Retorna top N namespaces mais usados - PRODUCTION-READY PostgreSQL
   */
  async getTopNamespaces(limit: number = 10, daysAgo: number = 30): Promise<UsageStats[]> {
    const stats = await this.getNamespaceStats(daysAgo);
    return stats.slice(0, limit);
  }
  
  /**
   * Retorna agentes menos usados - PRODUCTION-READY PostgreSQL
   */
  async getLeastUsedAgents(limit: number = 10, daysAgo: number = 30): Promise<UsageStats[]> {
    const stats = await this.getAgentStats(daysAgo);
    return stats.slice(Math.max(0, stats.length - limit)).reverse();
  }
  
  /**
   * Retorna namespaces menos usados - PRODUCTION-READY PostgreSQL
   */
  async getLeastUsedNamespaces(limit: number = 10, daysAgo: number = 30): Promise<UsageStats[]> {
    const stats = await this.getNamespaceStats(daysAgo);
    return stats.slice(Math.max(0, stats.length - limit)).reverse();
  }
  
  /**
   * Retorna estatísticas de sub-agents de um agent pai - PRODUCTION-READY PostgreSQL
   */
  async getSubAgents(parentAgentId: string, daysAgo: number = 30): Promise<UsageStats[]> {
    try {
      const records = await storage.getUsageRecords({ 
        entityType: "agent", 
        parentAgentId,
        daysAgo 
      });
      
      // Agrupar por entityId e calcular stats
      const grouped = new Map<string, typeof records>();
      
      for (const record of records) {
        const existing = grouped.get(record.entityId) || [];
        existing.push(record);
        grouped.set(record.entityId, existing);
      }
      
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const stats: UsageStats[] = [];
      
      for (const [entityId, entityRecords] of Array.from(grouped.entries())) {
        const sortedRecords = entityRecords.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const mostRecent = sortedRecords[0];
        
        stats.push({
          entityId,
          entityName: mostRecent?.entityName || entityId,
          totalUses: entityRecords.length,
          lastUsed: new Date(sortedRecords[0]?.timestamp || 0).getTime(),
          uses24h: entityRecords.filter(r => now - new Date(r.timestamp).getTime() < day).length,
          uses7d: entityRecords.filter(r => now - new Date(r.timestamp).getTime() < 7 * day).length,
          uses30d: entityRecords.filter(r => now - new Date(r.timestamp).getTime() < 30 * day).length,
          agentTier: mostRecent.agentTier,
          parentAgentId: mostRecent.parentAgentId,
          isRootNamespace: null,
          parentNamespace: null,
          subEntitiesCount: 0,
        });
      }
      
      return stats.sort((a, b) => b.totalUses - a.totalUses);
    } catch (error) {
      console.error("[UsageTracker] Error getting sub-agents:", error);
      return [];
    }
  }
  
  /**
   * Retorna estatísticas de sub-namespaces de um namespace pai - PRODUCTION-READY PostgreSQL
   */
  async getSubNamespaces(parentNamespace: string, daysAgo: number = 30): Promise<UsageStats[]> {
    try {
      const records = await storage.getUsageRecords({ 
        entityType: "namespace", 
        parentNamespace,
        daysAgo 
      });
      
      // Agrupar por entityId e calcular stats
      const grouped = new Map<string, typeof records>();
      
      for (const record of records) {
        const existing = grouped.get(record.entityId) || [];
        existing.push(record);
        grouped.set(record.entityId, existing);
      }
      
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const stats: UsageStats[] = [];
      
      for (const [entityId, entityRecords] of Array.from(grouped.entries())) {
        const sortedRecords = entityRecords.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const mostRecent = sortedRecords[0];
        
        stats.push({
          entityId,
          entityName: mostRecent?.entityName || entityId,
          totalUses: entityRecords.length,
          lastUsed: new Date(sortedRecords[0]?.timestamp || 0).getTime(),
          uses24h: entityRecords.filter(r => now - new Date(r.timestamp).getTime() < day).length,
          uses7d: entityRecords.filter(r => now - new Date(r.timestamp).getTime() < 7 * day).length,
          uses30d: entityRecords.filter(r => now - new Date(r.timestamp).getTime() < 30 * day).length,
          agentTier: null,
          parentAgentId: null,
          isRootNamespace: mostRecent.isRootNamespace,
          parentNamespace: mostRecent.parentNamespace,
          subEntitiesCount: 0,
        });
      }
      
      return stats.sort((a, b) => b.totalUses - a.totalUses);
    } catch (error) {
      console.error("[UsageTracker] Error getting sub-namespaces:", error);
      return [];
    }
  }
  
  /**
   * Retorna estatísticas de agents por tier - PRODUCTION-READY PostgreSQL
   */
  async getAgentsByTier(tier: "agent" | "subagent", daysAgo: number = 30): Promise<UsageStats[]> {
    try {
      const records = await storage.getUsageRecords({ 
        entityType: "agent", 
        agentTier: tier,
        daysAgo 
      });
      
      const allStats = await this.getAgentStats(daysAgo);
      return allStats.filter(stat => stat.agentTier === tier);
    } catch (error) {
      console.error("[UsageTracker] Error getting agents by tier:", error);
      return [];
    }
  }
  
  /**
   * Retorna apenas namespaces raiz (sem "/") - PRODUCTION-READY PostgreSQL
   */
  async getRootNamespaces(daysAgo: number = 30): Promise<UsageStats[]> {
    try {
      const records = await storage.getUsageRecords({ 
        entityType: "namespace", 
        isRootNamespace: true,
        daysAgo 
      });
      
      const allStats = await this.getNamespaceStats(daysAgo);
      return allStats.filter(stat => stat.isRootNamespace === true);
    } catch (error) {
      console.error("[UsageTracker] Error getting root namespaces:", error);
      return [];
    }
  }
  
  /**
   * Retorna overview com separação de hierarquia - PRODUCTION-READY PostgreSQL
   */
  async getHierarchicalOverview(daysAgo: number = 30): Promise<{
    agents: {
      rootAgents: number;
      subAgents: number;
      totalUses: number;
      uses24h: number;
    };
    namespaces: {
      rootNamespaces: number;
      subNamespaces: number;
      totalSearches: number;
      searches24h: number;
    };
  }> {
    try {
      const agentStats = await this.getAgentStats(daysAgo);
      const namespaceStats = await this.getNamespaceStats(daysAgo);
      
      const rootAgents = agentStats.filter(s => s.agentTier === "agent");
      const subAgents = agentStats.filter(s => s.agentTier === "subagent");
      const rootNamespaces = namespaceStats.filter(s => s.isRootNamespace === true);
      const subNamespaces = namespaceStats.filter(s => s.isRootNamespace === false);
      
      return {
        agents: {
          rootAgents: rootAgents.length,
          subAgents: subAgents.length,
          totalUses: agentStats.reduce((sum, s) => sum + s.totalUses, 0),
          uses24h: agentStats.reduce((sum, s) => sum + s.uses24h, 0),
        },
        namespaces: {
          rootNamespaces: rootNamespaces.length,
          subNamespaces: subNamespaces.length,
          totalSearches: namespaceStats.reduce((sum, s) => sum + s.totalUses, 0),
          searches24h: namespaceStats.reduce((sum, s) => sum + s.uses24h, 0),
        },
      };
    } catch (error) {
      console.error("[UsageTracker] Error getting hierarchical overview:", error);
      return {
        agents: { rootAgents: 0, subAgents: 0, totalUses: 0, uses24h: 0 },
        namespaces: { rootNamespaces: 0, subNamespaces: 0, totalSearches: 0, searches24h: 0 }
      };
    }
  }
  
  /**
   * Limpa histórico (apenas para testes/manutenção)
   */
  async clear(): Promise<void> {
    console.warn("[UsageTracker] clear() deprecated - data is now in PostgreSQL");
  }
  
  /**
   * Retorna total de registros (aproximado, baseado em última query)
   */
  async getTotalRecords(daysAgo: number = 30): Promise<number> {
    try {
      const records = await storage.getUsageRecords({ daysAgo });
      return records.length;
    } catch (error) {
      console.error("[UsageTracker] Error getting total records:", error);
      return 0;
    }
  }
}

// Singleton instance
export const usageTracker = new UsageTracker();
