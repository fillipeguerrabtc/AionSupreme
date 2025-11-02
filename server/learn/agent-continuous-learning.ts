/**
 * AGENT CONTINUOUS LEARNING - Aprendizado Contínuo de Agentes
 * 
 * Sistema de feedback loop para auto-evolução:
 * 1. Monitora performance de cada agente
 * 2. Coleta respostas bem-sucedidas
 * 3. Adiciona ao dataset de treino
 * 4. Dispara re-treino automático quando threshold é atingido
 * 
 * MÉTRICAS DE QUALIDADE:
 * - Tempo de resposta
 * - Taxa de sucesso (RAG hit vs miss)
 * - Feedback do usuário (se disponível)
 * - Uso de ferramentas corretas
 */

import { db } from "../db";
import { conversations, messages, agents, trainingDataCollection } from "../../shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { publishEvent } from "../events";

interface AgentPerformanceMetrics {
  agentId: number;
  agentSlug: string;
  totalRequests: number;
  successfulResponses: number;
  avgResponseTime: number;
  ragHitRate: number;
  qualityScore: number; // 0-100
}

interface LearningConfig {
  minExamplesThreshold: number; // Mínimo de exemplos para re-treino
  qualityThreshold: number; // Qualidade mínima (0-100)
  collectionInterval: number; // Intervalo de coleta (ms)
}

export class AgentContinuousLearning {
  private config: LearningConfig = {
    minExamplesThreshold: 100,
    qualityThreshold: 70,
    collectionInterval: 60 * 60 * 1000, // 1 hora
  };

  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Calcular métricas de performance de um agente
   */
  async calculateAgentMetrics(agentId: number): Promise<AgentPerformanceMetrics | null> {
    try {
      // Buscar agente
      const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
      if (!agent) return null;

      // Buscar conversas recentes onde o agente foi usado
      // (Assumindo que metadata da mensagem tem agentId)
      const recentMessages = await db.query.messages.findMany({
        where: and(
          eq(messages.role, 'assistant'),
          sql`${messages.metadata}->>'agentId' = ${agentId.toString()}`
        ),
        limit: 1000,
        orderBy: [desc(messages.createdAt)],
      });

      if (recentMessages.length === 0) {
        return {
          agentId,
          agentSlug: agent.slug,
          totalRequests: 0,
          successfulResponses: 0,
          avgResponseTime: 0,
          ragHitRate: 0,
          qualityScore: 0,
        };
      }

      // Calcular métricas
      let successfulCount = 0;
      let totalResponseTime = 0;
      let ragHits = 0;

      for (const msg of recentMessages) {
        const metadata = msg.metadata as any;

        // Considerar sucesso se:
        // - Resposta não contém erro
        // - Resposta não é muito curta (> 50 chars)
        const isSuccessful = 
          !msg.content.toLowerCase().includes('error') &&
          !msg.content.toLowerCase().includes('desculpe') &&
          msg.content.length > 50;

        if (isSuccessful) {
          successfulCount++;
        }

        // RAG hit = encontrou conteúdo relevante na KB
        if (metadata?.ragUsed === true) {
          ragHits++;
        }

        // Response time (se disponível)
        if (metadata?.responseTime) {
          totalResponseTime += metadata.responseTime;
        }
      }

      const successRate = (successfulCount / recentMessages.length) * 100;
      const ragHitRate = (ragHits / recentMessages.length) * 100;
      const avgResponseTime = totalResponseTime / recentMessages.length;

      // Quality score = média ponderada
      const qualityScore = (successRate * 0.6) + (ragHitRate * 0.4);

      return {
        agentId,
        agentSlug: agent.slug,
        totalRequests: recentMessages.length,
        successfulResponses: successfulCount,
        avgResponseTime,
        ragHitRate,
        qualityScore,
      };
    } catch (error) {
      console.error(`[Agent Learning] Erro calculando métricas:`, error);
      return null;
    }
  }

  /**
   * Coletar respostas de alta qualidade de um agente
   */
  async collectHighQualityResponses(agentId: number): Promise<number> {
    console.log(`\n🧠 [Agent Learning] Coletando respostas de qualidade do agente #${agentId}...`);

    try {
      const metrics = await this.calculateAgentMetrics(agentId);
      
      if (!metrics || metrics.qualityScore < this.config.qualityThreshold) {
        console.log(`   ⚠️  Qualidade insuficiente (${metrics?.qualityScore.toFixed(1) || 0}/100)`);
        return 0;
      }

      console.log(`   ✅ Qualidade: ${metrics.qualityScore.toFixed(1)}/100`);

      // Buscar conversas recentes do agente
      const recentMessages = await db.query.messages.findMany({
        where: and(
          eq(messages.role, 'assistant'),
          sql`${messages.metadata}->>'agentId' = ${agentId.toString()}`
        ),
        limit: 500,
        orderBy: [desc(messages.createdAt)],
      });

      let collected = 0;

      // Para cada mensagem, buscar a pergunta do usuário anterior
      for (const assistantMsg of recentMessages) {
        // Buscar mensagem do usuário anterior
        const userMessages = await db.query.messages.findMany({
          where: and(
            eq(messages.conversationId, assistantMsg.conversationId),
            eq(messages.role, 'user'),
            sql`${messages.createdAt} < ${assistantMsg.createdAt}`
          ),
          orderBy: [desc(messages.createdAt)],
          limit: 1,
        });

        if (userMessages.length === 0) continue;

        const userMsg = userMessages[0];

        // Validar qualidade do par
        if (!this.isHighQualityPair(userMsg.content, assistantMsg.content)) {
          continue;
        }

        // Verificar se já não existe no dataset
        const existing = await db.query.trainingDataCollection.findFirst({
          where: and(
            sql`${trainingDataCollection.metadata}->>'assistantMsgId' = ${assistantMsg.id.toString()}`
          ),
        });

        if (existing) continue;

        // Adicionar ao dataset de treino
        await db.insert(trainingDataCollection).values({
          source: `agent:${metrics.agentSlug}`,
          instruction: userMsg.content,
          input: '',
          output: assistantMsg.content,
          quality: 'high',
          metadata: {
            agentId,
            agentSlug: metrics.agentSlug,
            conversationId: assistantMsg.conversationId,
            userMsgId: userMsg.id,
            assistantMsgId: assistantMsg.id,
            qualityScore: metrics.qualityScore,
            collectedAt: new Date().toISOString(),
          },
          isUsedInTraining: false,
        } as any);

        collected++;

        // Limite de coleta por execução
        if (collected >= this.config.minExamplesThreshold) {
          break;
        }
      }

      console.log(`   ✅ ${collected} pares de treino coletados`);

      // Emitir evento
      if (collected > 0) {
        await publishEvent("TRAINING_DATA_ADDED", {
          source: `agent:${metrics.agentSlug}`,
          count: collected,
          agentId,
        });
      }

      return collected;
    } catch (error: any) {
      console.error(`[Agent Learning] Erro:`, error.message);
      return 0;
    }
  }

  /**
   * Validar qualidade de um par user/assistant
   */
  private isHighQualityPair(userMsg: string, assistantMsg: string): boolean {
    // Tamanho mínimo
    if (userMsg.length < 20 || assistantMsg.length < 50) {
      return false;
    }

    // Excluir erros
    const errorPatterns = ['erro', 'error', 'desculpe', 'sorry', 'não consigo'];
    const assistantLower = assistantMsg.toLowerCase();
    
    for (const pattern of errorPatterns) {
      if (assistantLower.includes(pattern)) {
        return false;
      }
    }

    // Excluir respostas genéricas
    if (assistantMsg.length < 100 && assistantLower.includes('posso ajudar')) {
      return false;
    }

    return true;
  }

  /**
   * Coletar de todos os agentes
   */
  async collectFromAllAgents(): Promise<{totalCollected: number; agentCounts: Record<string, number>}> {
    console.log(`\n🤖 [Agent Learning] Executando coleta de todos os agentes...`);

    const allAgents = await db.query.agents.findMany();
    const agentCounts: Record<string, number> = {};
    let totalCollected = 0;

    for (const agent of allAgents) {
      const collected = await this.collectHighQualityResponses(agent.id);
      agentCounts[agent.slug] = collected;
      totalCollected += collected;
    }

    console.log(`\n📊 Resumo da coleta:`);
    console.log(`   Total: ${totalCollected} exemplos`);
    for (const [slug, count] of Object.entries(agentCounts)) {
      if (count > 0) {
        console.log(`   - ${slug}: ${count}`);
      }
    }

    return { totalCollected, agentCounts };
  }

  /**
   * Iniciar coleta automática periódica
   */
  start(): void {
    if (this.intervalId) {
      console.log("[Agent Learning] ✅ Já está rodando");
      return;
    }

    console.log(`[Agent Learning] 📅 Iniciado - coleta a cada ${this.config.collectionInterval / 1000 / 60} min`);

    // Executar imediatamente
    this.collectFromAllAgents();

    // Depois executar periodicamente
    this.intervalId = setInterval(() => {
      this.collectFromAllAgents();
    }, this.config.collectionInterval);
  }

  /**
   * Parar coleta automática
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[Agent Learning] ⏹  Parado");
    }
  }

  /**
   * Configurar parâmetros
   */
  configure(config: Partial<LearningConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(`[Agent Learning] Configuração atualizada:`, this.config);
  }
}

// Singleton
export const agentContinuousLearning = new AgentContinuousLearning();
