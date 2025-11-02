/**
 * Sistema de Rastreamento de Uso de Agentes e Namespaces
 * 
 * Registra automaticamente:
 * - Uso de agentes (quantas vezes cada agente foi acionado)
 * - Uso de namespaces (quantas buscas na KB por namespace)
 * - Histórico temporal (últimas 30 dias)
 * - Rankings (mais/menos usados)
 */

interface UsageRecord {
  entityType: "agent" | "namespace";
  entityId: string;
  entityName: string;
  timestamp: number;
  operation: "query" | "search" | "generation" | "tool_use";
  metadata?: Record<string, any>;
  
  // Hierarquia (novo)
  agentTier?: "agent" | "subagent"; // Para rastreamento granular de agents
  parentAgentId?: string; // ID do agent pai (se subagent)
  isRootNamespace?: boolean; // true se namespace não tem "/" (root), false se é sub-namespace
  parentNamespace?: string; // Namespace pai inferido (ex: "financas" para "financas/investimentos")
}

interface UsageStats {
  entityId: string;
  entityName: string;
  totalUses: number;
  lastUsed: number;
  uses24h: number;
  uses7d: number;
  uses30d: number;
  
  // Hierarquia (novo)
  agentTier?: "agent" | "subagent";
  parentAgentId?: string;
  isRootNamespace?: boolean;
  parentNamespace?: string;
  subEntitiesCount?: number; // Quantidade de sub-agentes ou sub-namespaces
}

interface TimeSeriesData {
  date: string; // YYYY-MM-DD
  count: number;
}

interface NamespaceRelevanceRecord {
  namespace: string;
  timestamp: number;
  avgRelevanceScore: number; // 0-1 (cosine similarity)
  resultCount: number;
}

interface NamespaceQualityStats {
  namespace: string;
  searchCount: number;
  avgRelevance: number; // Real average relevance from search results
  minRelevance: number;
  maxRelevance: number;
}

class UsageTracker {
  private records: UsageRecord[] = [];
  private relevanceRecords: NamespaceRelevanceRecord[] = [];
  private readonly maxRecords = 10000; // Últimos 10k registros em memória
  private readonly maxRelevanceRecords = 5000; // Últimos 5k registros de relevância
  
  /**
   * Registra uso de um agente (com hierarquia)
   */
  trackAgentUse(
    agentId: string,
    agentName: string,
    operation: UsageRecord["operation"],
    metadata?: Record<string, any>,
    agentTier?: "agent" | "subagent",
    parentAgentId?: string
  ): void {
    this.addRecord({
      entityType: "agent",
      entityId: agentId,
      entityName: agentName,
      timestamp: Date.now(),
      operation,
      metadata,
      agentTier,
      parentAgentId,
    });
  }
  
  /**
   * Registra busca em namespace (com hierarquia)
   */
  trackNamespaceSearch(
    namespaceId: string,
    namespaceName: string,
    metadata?: Record<string, any>
  ): void {
    // Inferir hierarquia do namespace pelo nome
    const isRootNamespace = !namespaceName.includes("/");
    const parentNamespace = isRootNamespace
      ? undefined
      : namespaceName.split("/")[0];
    
    this.addRecord({
      entityType: "namespace",
      entityId: namespaceId,
      entityName: namespaceName,
      timestamp: Date.now(),
      operation: "search",
      metadata,
      isRootNamespace,
      parentNamespace,
    });
  }
  
  /**
   * Registra qualidade de resultados de busca RAG (PRODUCTION-READY)
   * Rastreia scores reais de relevância retornados pelo VectorStore
   */
  trackNamespaceSearchQuality(
    namespace: string,
    relevanceScores: number[] // Array de cosine similarities (0-1) dos resultados
  ): void {
    if (relevanceScores.length === 0) return;
    
    const avgRelevanceScore = relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length;
    
    const record: NamespaceRelevanceRecord = {
      namespace,
      timestamp: Date.now(),
      avgRelevanceScore,
      resultCount: relevanceScores.length,
    };
    
    this.relevanceRecords.push(record);
    
    // Remove registros antigos se exceder limite
    if (this.relevanceRecords.length > this.maxRelevanceRecords) {
      this.relevanceRecords = this.relevanceRecords.slice(-this.maxRelevanceRecords);
    }
  }
  
  /**
   * Retorna estatísticas de qualidade por namespace (PRODUCTION-READY)
   * Calcula média REAL de relevance scores
   */
  getNamespaceQualityStats(): NamespaceQualityStats[] {
    const grouped = new Map<string, number[]>();
    
    // Agrupar scores por namespace
    for (const record of this.relevanceRecords) {
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
  }
  
  /**
   * Adiciona registro e mantém limite de memória
   */
  private addRecord(record: UsageRecord): void {
    this.records.push(record);
    
    // Remove registros antigos se exceder limite
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }
  
  /**
   * Retorna estatísticas de uso de agentes
   */
  getAgentStats(): UsageStats[] {
    return this.calculateStats("agent");
  }
  
  /**
   * Retorna estatísticas de uso de namespaces
   */
  getNamespaceStats(): UsageStats[] {
    return this.calculateStats("namespace");
  }
  
  /**
   * Calcula estatísticas agregadas (com hierarquia)
   */
  private calculateStats(entityType: "agent" | "namespace"): UsageStats[] {
    const filtered = this.records.filter((r) => r.entityType === entityType);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    
    // Agrupar por entityId
    const grouped = new Map<string, UsageRecord[]>();
    
    for (const record of filtered) {
      const existing = grouped.get(record.entityId) || [];
      existing.push(record);
      grouped.set(record.entityId, existing);
    }
    
    // Calcular estatísticas para cada entidade
    const stats: UsageStats[] = [];
    
    for (const [entityId, records] of Array.from(grouped.entries())) {
      const sortedRecords = records.sort((a: UsageRecord, b: UsageRecord) => b.timestamp - a.timestamp);
      const lastUsed = sortedRecords[0]?.timestamp || 0;
      const mostRecent = sortedRecords[0];
      
      // Contar sub-entidades (se for agent pai ou namespace raiz)
      let subEntitiesCount = 0;
      
      if (entityType === "agent" && mostRecent.agentTier === "agent") {
        // Contar quantos sub-agents existem com este parentAgentId
        const subAgentIds = new Set(
          filtered.filter(r => r.parentAgentId === entityId).map(r => r.entityId)
        );
        subEntitiesCount = subAgentIds.size;
      } else if (entityType === "namespace" && mostRecent.isRootNamespace) {
        // Contar quantos sub-namespaces existem com este parent
        const subNamespaceIds = new Set(
          filtered.filter(r => r.parentNamespace === mostRecent.entityName).map(r => r.entityId)
        );
        subEntitiesCount = subNamespaceIds.size;
      }
      
      stats.push({
        entityId,
        entityName: mostRecent?.entityName || entityId,
        totalUses: records.length,
        lastUsed,
        uses24h: records.filter((r: UsageRecord) => now - r.timestamp < day).length,
        uses7d: records.filter((r: UsageRecord) => now - r.timestamp < 7 * day).length,
        uses30d: records.filter((r: UsageRecord) => now - r.timestamp < 30 * day).length,
        
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
  }
  
  /**
   * Retorna série temporal de uso de um agente específico
   */
  getAgentTimeSeries(agentId: string, days: number = 30): TimeSeriesData[] {
    return this.calculateTimeSeries("agent", agentId, days);
  }
  
  /**
   * Retorna série temporal de uso de um namespace específico
   */
  getNamespaceTimeSeries(namespaceId: string, days: number = 30): TimeSeriesData[] {
    return this.calculateTimeSeries("namespace", namespaceId, days);
  }
  
  /**
   * Retorna série temporal agregada de todos agentes
   */
  getAllAgentsTimeSeries(days: number = 30): TimeSeriesData[] {
    return this.calculateTimeSeries("agent", null, days);
  }
  
  /**
   * Retorna série temporal agregada de todos namespaces
   */
  getAllNamespacesTimeSeries(days: number = 30): TimeSeriesData[] {
    return this.calculateTimeSeries("namespace", null, days);
  }
  
  /**
   * Calcula série temporal (histórico diário)
   */
  private calculateTimeSeries(
    entityType: "agent" | "namespace",
    entityId: string | null,
    days: number
  ): TimeSeriesData[] {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    // Filtrar registros
    let filtered = this.records.filter(
      (r) =>
        r.entityType === entityType &&
        now - r.timestamp < days * dayMs
    );
    
    // Se entityId específico, filtrar mais
    if (entityId) {
      filtered = filtered.filter((r) => r.entityId === entityId);
    }
    
    // Agrupar por data
    const byDate = new Map<string, number>();
    
    for (const record of filtered) {
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
  }
  
  /**
   * Retorna top N agentes mais usados
   */
  getTopAgents(limit: number = 10): UsageStats[] {
    return this.getAgentStats().slice(0, limit);
  }
  
  /**
   * Retorna top N namespaces mais usados
   */
  getTopNamespaces(limit: number = 10): UsageStats[] {
    return this.getNamespaceStats().slice(0, limit);
  }
  
  /**
   * Retorna agentes menos usados
   */
  getLeastUsedAgents(limit: number = 10): UsageStats[] {
    const stats = this.getAgentStats();
    return stats.slice(Math.max(0, stats.length - limit)).reverse();
  }
  
  /**
   * Retorna namespaces menos usados
   */
  getLeastUsedNamespaces(limit: number = 10): UsageStats[] {
    const stats = this.getNamespaceStats();
    return stats.slice(Math.max(0, stats.length - limit)).reverse();
  }
  
  /**
   * Retorna estatísticas de sub-agents de um agent pai
   */
  getSubAgents(parentAgentId: string): UsageStats[] {
    const allStats = this.getAgentStats();
    return allStats
      .filter((stat) => stat.parentAgentId === parentAgentId)
      .sort((a, b) => b.totalUses - a.totalUses);
  }
  
  /**
   * Retorna estatísticas de sub-namespaces de um namespace pai
   */
  getSubNamespaces(parentNamespace: string): UsageStats[] {
    const allStats = this.getNamespaceStats();
    return allStats
      .filter((stat) => stat.parentNamespace === parentNamespace)
      .sort((a, b) => b.totalUses - a.totalUses);
  }
  
  /**
   * Retorna estatísticas de agents por tier
   */
  getAgentsByTier(tier: "agent" | "subagent"): UsageStats[] {
    const allStats = this.getAgentStats();
    return allStats.filter((stat) => stat.agentTier === tier);
  }
  
  /**
   * Retorna apenas namespaces raiz (sem "/")
   */
  getRootNamespaces(): UsageStats[] {
    const allStats = this.getNamespaceStats();
    return allStats.filter((stat) => stat.isRootNamespace === true);
  }
  
  /**
   * Retorna overview com separação de hierarquia
   */
  getHierarchicalOverview(): {
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
  } {
    const agentStats = this.getAgentStats();
    const namespaceStats = this.getNamespaceStats();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    
    const rootAgents = agentStats.filter((s) => s.agentTier === "agent");
    const subAgents = agentStats.filter((s) => s.agentTier === "subagent");
    const rootNamespaces = namespaceStats.filter((s) => s.isRootNamespace === true);
    const subNamespaces = namespaceStats.filter((s) => s.isRootNamespace === false);
    
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
  }
  
  /**
   * Limpa histórico
   */
  clear(): void {
    this.records = [];
  }
  
  /**
   * Retorna total de registros em memória
   */
  getTotalRecords(): number {
    return this.records.length;
  }
}

// Singleton instance
export const usageTracker = new UsageTracker();
