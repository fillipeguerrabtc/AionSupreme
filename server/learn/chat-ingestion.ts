/**
 * CHAT INGESTION - Ingestão Automática de Conversas para Treino
 * 
 * Coleta conversas de alta qualidade do chat e envia para curadoria.
 * 
 * CRITÉRIOS DE QUALIDADE:
 * - Resposta completa (> 50 tokens)
 * - Não contém erros
 * - Não contém recusas ("I cannot", "I'm sorry")
 * - Conversa bem avaliada pelo usuário (se houver rating)
 */

import { db } from "../db";
import { conversations, messages, curationQueue } from "../../shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

interface ChatIngestionCriteria {
  minTokens?: number;
  maxTokens?: number;
  minRating?: number;
  excludeErrors?: boolean;
  limit?: number;
  autoSubmit?: boolean; // Se true, submete direto para curadoria
}

export class ChatIngestionService {
  /**
   * Estimar tokens (aproximado)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Verificar se resposta tem qualidade suficiente
   */
  private isHighQuality(userMsg: string, assistantMsg: string): boolean {
    // Excluir respostas de erro
    const errorPatterns = [
      'I cannot',
      'I\'m not able to',
      'I apologize',
      'I\'m sorry',
      'error',
      'Desculpe',
      'Não consigo',
      'erro',
    ];

    const assistantLower = assistantMsg.toLowerCase();
    for (const pattern of errorPatterns) {
      if (assistantLower.includes(pattern.toLowerCase())) {
        return false;
      }
    }

    // Verificar tamanho mínimo
    const assistantTokens = this.estimateTokens(assistantMsg);
    if (assistantTokens < 50) {
      return false;
    }

    // Verificar se não é muito genérica
    const genericPhrases = [
      'how can i help',
      'posso ajudar',
      'como posso',
    ];

    for (const phrase of genericPhrases) {
      if (assistantLower.includes(phrase.toLowerCase()) && assistantTokens < 100) {
        return false;
      }
    }

    return true;
  }

  /**
   * Coletar conversas de alta qualidade
   */
  async collectHighQualityConversations(
    criteria: ChatIngestionCriteria = {}
  ): Promise<number> {
    const {
      minTokens = 50,
      maxTokens = 2048,
      limit = 100,
      autoSubmit = false,
    } = criteria;

    console.log(`\n📊 [Chat Ingestion] Coletando conversas de qualidade...`);

    // Buscar conversas recentes
    const recentConversations = await db.query.conversations.findMany({
      orderBy: [desc(conversations.createdAt)],
      limit: limit * 2, // Buscar o dobro, depois filtrar
    });

    let collected = 0;

    for (const conversation of recentConversations) {
      // Buscar mensagens da conversa
      const conversationMessages = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversation.id),
        orderBy: [messages.createdAt],
      });

      // Criar pares user→assistant
      for (let i = 0; i < conversationMessages.length - 1; i++) {
        const userMsg = conversationMessages[i];
        const assistantMsg = conversationMessages[i + 1];

        // Validar par
        if (userMsg.role !== 'user' || assistantMsg.role !== 'assistant') {
          continue;
        }

        const userTokens = this.estimateTokens(userMsg.content);
        const assistantTokens = this.estimateTokens(assistantMsg.content);

        // Verificar critérios de tamanho
        if (userTokens < minTokens || assistantTokens < minTokens) {
          continue;
        }

        if (userTokens > maxTokens || assistantTokens > maxTokens) {
          continue;
        }

        // Verificar qualidade
        if (!this.isHighQuality(userMsg.content, assistantMsg.content)) {
          continue;
        }

        // Criar dados de treino
        const trainingData = [{
          instruction: userMsg.content,
          input: '',
          output: assistantMsg.content,
        }];

        // Submeter para curadoria (se autoSubmit = true)
        if (autoSubmit) {
          await db.insert(curationQueue).values({
            contentType: 'chat',
            title: `Conversa: ${userMsg.content.substring(0, 50)}...`,
            content: `User: ${userMsg.content}\n\nAssistant: ${assistantMsg.content}`,
            metadata: {
              conversationId: conversation.id,
              userMsgId: userMsg.id,
              assistantMsgId: assistantMsg.id,
              userTokens,
              assistantTokens,
            },
            status: 'pending',
            trainingData: trainingData as any,
          } as any);

          collected++;
        }

        // Limite alcançado
        if (collected >= limit) {
          break;
        }
      }

      if (collected >= limit) {
        break;
      }
    }

    console.log(`   ✅ ${collected} conversas coletadas para curadoria`);
    return collected;
  }

  /**
   * Executar coleta automática (background job)
   */
  async runAutoCollection(): Promise<void> {
    console.log(`\n🤖 [Chat Ingestion] Execução automática iniciada...`);

    const collected = await this.collectHighQualityConversations({
      minTokens: 50,
      maxTokens: 2048,
      limit: 50, // 50 conversas por execução
      autoSubmit: true,
    });

    if (collected > 0) {
      console.log(`   ✅ Auto-coleta concluída: ${collected} conversas enviadas para curadoria`);
    } else {
      console.log(`   ℹ️  Nenhuma conversa nova com qualidade suficiente`);
    }
  }

  /**
   * Agendar coleta automática periódica
   */
  startAutoCollection(intervalMs: number = 60 * 60 * 1000): void {
    console.log(`[Chat Ingestion] 📅 Auto-coleta agendada a cada ${intervalMs / 1000 / 60} minutos`);

    // Executar imediatamente
    this.runAutoCollection();

    // Depois executar periodicamente
    setInterval(() => {
      this.runAutoCollection();
    }, intervalMs);
  }
}

// Singleton
export const chatIngestionService = new ChatIngestionService();
