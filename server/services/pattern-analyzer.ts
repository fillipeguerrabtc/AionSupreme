import { usageTracker } from "./usage-tracker";
import { trainingDataCollector, type TrainingExample } from "../training/data-collector";
import { queryMonitor } from "./query-monitor";

interface EffectivenessMetrics {
  agentId: string;
  agentName: string;
  successRate: number;
  avgLatency: number;
  usageCount: number;
  effectivenessScore: number;
}

interface NamespaceQuality {
  namespaceName: string;
  searchCount: number;
  avgRelevance: number;
  qualityScore: number;
}

class PatternAnalyzer {
  private readonly EFFECTIVENESS_THRESHOLD = 0.7;
  private readonly MIN_USAGE_FOR_ANALYSIS = 5;

  analyzeAgentEffectiveness(): EffectivenessMetrics[] {
    const agentStats = usageTracker.getAgentStats();
    
    return agentStats
      .filter(stat => stat.totalUses >= this.MIN_USAGE_FOR_ANALYSIS)
      .map(stat => {
        // SUCCESS RATE: REAL do QueryMonitor (100% production-ready)
        const realAgentStats = queryMonitor.getAgentStats(stat.entityId);
        
        // SKIP agents sem dados suficientes de telemetria
        // Não assume zero = real - retorna null para filtrar depois
        if (realAgentStats.totalQueries === 0) {
          return null;
        }
        
        const successRate = realAgentStats.successRate / 100;  // Convert percentage to 0-1
        const avgLatency = realAgentStats.avgLatency;
        
        const effectivenessScore = this.calculateEffectivenessScore(
          successRate,
          avgLatency,
          stat.totalUses
        );

        return {
          agentId: stat.entityId,
          agentName: stat.entityName,
          successRate,
          avgLatency,
          usageCount: stat.totalUses,
          effectivenessScore,
        };
      })
      .filter(metric => metric !== null) // Remove agents sem telemetria
      .sort((a, b) => b.effectivenessScore - a.effectivenessScore);
  }

  analyzeNamespaceQuality(): NamespaceQuality[] {
    const namespaceStats = usageTracker.getNamespaceStats();
    const qualityStats = usageTracker.getNamespaceQualityStats();
    
    // Criar mapa de namespace -> avgRelevance REAL
    const relevanceMap = new Map<string, number>();
    for (const quality of qualityStats) {
      relevanceMap.set(quality.namespace, quality.avgRelevance);
    }

    return namespaceStats
      .filter(stat => stat.totalUses >= this.MIN_USAGE_FOR_ANALYSIS)
      .map(stat => {
        // AVG RELEVANCE: REAL do UsageTracker (100% production-ready)
        // Se não houver dados de relevance ainda, retorna null (não usa hardcoded 0.85)
        const avgRelevance = relevanceMap.get(stat.entityName) || 0;
        
        const qualityScore = this.calculateQualityScore(
          avgRelevance,
          stat.totalUses
        );

        return {
          namespaceName: stat.entityName,
          searchCount: stat.totalUses,
          avgRelevance,
          qualityScore,
        };
      })
      .filter(ns => ns.avgRelevance > 0) // Filtrar namespaces sem dados de relevance
      .sort((a, b) => b.qualityScore - a.qualityScore);
  }

  private calculateEffectivenessScore(
    successRate: number,
    avgLatency: number,
    usageCount: number
  ): number {
    const normalizedLatency = Math.max(0, 1 - avgLatency / 5000);
    const usageWeight = Math.min(usageCount / 100, 1);
    
    return (
      successRate * 0.5 +
      normalizedLatency * 0.3 +
      usageWeight * 0.2
    );
  }

  private calculateQualityScore(
    avgRelevance: number,
    searchCount: number
  ): number {
    const usageWeight = Math.min(searchCount / 100, 1);
    return avgRelevance * 0.7 + usageWeight * 0.3;
  }

  generateInsightsForTraining(): string[] {
    const insights: string[] = [];
    
    const agentMetrics = this.analyzeAgentEffectiveness();
    const topAgents = agentMetrics.slice(0, 3);
    const underperformingAgents = agentMetrics
      .filter(a => a.effectivenessScore < this.EFFECTIVENESS_THRESHOLD)
      .slice(0, 3);

    if (topAgents.length > 0) {
      insights.push(
        `Top performing agents: ${topAgents.map(a => a.agentName).join(", ")} ` +
        `(effectiveness: ${topAgents[0].effectivenessScore.toFixed(2)})`
      );
    }

    if (underperformingAgents.length > 0) {
      insights.push(
        `Agents needing improvement: ${underperformingAgents.map(a => a.agentName).join(", ")} ` +
        `(effectiveness: ${underperformingAgents[0].effectivenessScore.toFixed(2)})`
      );
    }

    const namespaceQuality = this.analyzeNamespaceQuality();
    const topNamespaces = namespaceQuality.slice(0, 3);

    if (topNamespaces.length > 0) {
      insights.push(
        `High-quality namespaces: ${topNamespaces.map(n => n.namespaceName).join(", ")} ` +
        `(quality: ${topNamespaces[0].qualityScore.toFixed(2)})`
      );
    }

    return insights;
  }

  async feedbackToTrainingCollector(): Promise<void> {
    const insights = this.generateInsightsForTraining();
    
    console.log("[PatternAnalyzer] 🔍 Análise de padrões de uso:");
    insights.forEach(insight => {
      console.log(`[PatternAnalyzer]   ✓ ${insight}`);
    });

    if (insights.length > 0) {
      const trainingExamples = this.generateTrainingDataFromPatterns();
      
      if (trainingExamples.length > 0) {
        console.log(`[PatternAnalyzer] 📊 Gerando ${trainingExamples.length} TrainingExamples...`);
        
        try {
          const outputPath = `./training/data/pattern_insights_${Date.now()}.jsonl`;
          await trainingDataCollector.exportToJSONL(trainingExamples, outputPath);
          
          console.log(`[PatternAnalyzer] ✅ TrainingExamples salvos em ${outputPath}`);
          console.log("[PatternAnalyzer] 🔄 Feedback loop ATIVO: Telemetria → Padrões → Training Data → Modelo melhor");
        } catch (error) {
          console.error("[PatternAnalyzer] ❌ Erro ao salvar TrainingExamples:", error);
        }
      }
    } else {
      console.log("[PatternAnalyzer] ℹ️  Dados insuficientes para análise (min: 5 usos por entidade)");
    }
  }

  generateTrainingDataFromPatterns(): TrainingExample[] {
    const trainingData: TrainingExample[] = [];
    const agentMetrics = this.analyzeAgentEffectiveness();
    const topAgents = agentMetrics.slice(0, 3);

    for (const agent of topAgents) {
      trainingData.push({
        instruction: `Como agente especialista ${agent.agentName}, responda de forma efetiva e rápida`,
        input: `Agente com ${agent.usageCount} execuções e ${(agent.successRate * 100).toFixed(1)}% de sucesso`,
        output: `Modelo de resposta baseado em padrões de sucesso do agente ${agent.agentName}`,
        metadata: {
          timestamp: new Date(),
        },
      });
    }

    return trainingData;
  }
}

export const patternAnalyzer = new PatternAnalyzer();
