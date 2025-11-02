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
}

interface UsageStats {
  entityId: string;
  entityName: string;
  totalUses: number;
  lastUsed: number;
  uses24h: number;
  uses7d: number;
  uses30d: number;
}

interface TimeSeriesData {
  date: string; // YYYY-MM-DD
  count: number;
}

class UsageTracker {
  private records: UsageRecord[] = [];
  private readonly maxRecords = 10000; // Últimos 10k registros em memória
  
  /**
   * Registra uso de um agente
   */
  trackAgentUse(
    agentId: string,
    agentName: string,
    operation: UsageRecord["operation"],
    metadata?: Record<string, any>
  ): void {
    this.addRecord({
      entityType: "agent",
      entityId: agentId,
      entityName: agentName,
      timestamp: Date.now(),
      operation,
      metadata,
    });
  }
  
  /**
   * Registra busca em namespace
   */
  trackNamespaceSearch(
    namespaceId: string,
    namespaceName: string,
    metadata?: Record<string, any>
  ): void {
    this.addRecord({
      entityType: "namespace",
      entityId: namespaceId,
      entityName: namespaceName,
      timestamp: Date.now(),
      operation: "search",
      metadata,
    });
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
   * Calcula estatísticas agregadas
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
      
      stats.push({
        entityId,
        entityName: sortedRecords[0]?.entityName || entityId,
        totalUses: records.length,
        lastUsed,
        uses24h: records.filter((r: UsageRecord) => now - r.timestamp < day).length,
        uses7d: records.filter((r: UsageRecord) => now - r.timestamp < 7 * day).length,
        uses30d: records.filter((r: UsageRecord) => now - r.timestamp < 30 * day).length,
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
