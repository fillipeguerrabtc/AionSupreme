/**
 * AUTO-INDEXER - Sistema de Auto-Aprendizado Contínuo
 * 
 * Automaticamente indexa TODO conhecimento obtido:
 * - Respostas do chat (conversas de qualidade)
 * - Conteúdo de APIs externas (Groq, Gemini, etc)
 * - Web search results (quando busca na web)
 * - Qualquer conhecimento novo que AION aprende
 * 
 * FLUXO:
 * 1. AION responde algo
 * 2. Auto-indexer avalia se é conhecimento valioso
 * 3. Adiciona automaticamente na Knowledge Base
 * 4. Quando atingir X exemplos → trigger treino automático
 */

import { db } from "../db";
import { documents, embeddings, conversations, messages } from "../../shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { ragService } from "../rag/vector-store";
import { ConversationCollector } from "./collectors/conversation-collector";
import { namespaceClassifier } from "../services/namespace-classifier"; // PHASE 2: Semantic namespace detection

interface IndexableContent {
  title: string;
  content: string;
  source: "chat" | "web" | "api" | "fallback";
  metadata?: Record<string, any>;
  namespace?: string;
}

interface AutoIndexerStats {
  totalIndexed: number;
  indexedToday: number;
  pendingExamples: number;
  lastIndexedAt?: Date;
}

export class AutoIndexer {
  private minQualityScore = 50; // Mínimo de qualidade para indexar
  private minContentLength = 100; // Mínimo de caracteres
  private enabled = true; // Flag para ativar/desativar

  /**
   * Auto-indexa uma resposta do AION se for conhecimento valioso
   */
  async indexResponse(params: {
    conversationId: number | null;
    userMessage: string;
    assistantResponse: string;
    source: "chat" | "web" | "api" | "fallback";
    provider?: string;
  }): Promise<boolean> {
    if (!this.enabled) {
      console.log("[AutoIndexer] Desabilitado - pulando indexação");
      return false;
    }

    const { conversationId, userMessage, assistantResponse, source, provider } = params;

    // STEP 1: Avaliar se vale a pena indexar
    const shouldIndex = this.evaluateContent(assistantResponse);
    
    if (!shouldIndex) {
      console.log(`[AutoIndexer] Resposta não atinge critérios mínimos - pulando indexação`);
      return false;
    }

    // STEP 2: Verificar duplicação (evitar indexar conhecimento repetido)
    const isDuplicate = await this.checkDuplicate(assistantResponse);
    
    if (isDuplicate) {
      console.log(`[AutoIndexer] Conteúdo duplicado detectado - pulando indexação`);
      return false;
    }

    // STEP 3: Enviar para CURATION QUEUE (HITL - Human-in-the-Loop)
    // NÃO salvar direto na KB - isso previne contaminação do conhecimento
    try {
      const title = this.extractTitle(userMessage, assistantResponse);
      
      // PHASE 2: Use semantic namespace classification (LLM-based, not keywords)
      const suggestedNamespaces = await this.determineNamespaceSemantic(userMessage, assistantResponse);
      
      const qualityScore = this.calculateAutoQualityScore(userMessage, assistantResponse);
      
      // Importar curationQueue table
      const { curationQueue } = await import("../../shared/schema");
      
      // Adicionar à fila de curadoria (tenantId defaults to 1 in schema)
      const [curationItem] = await db.insert(curationQueue).values({
        title,
        content: assistantResponse,
        suggestedNamespaces,
        tags: [`auto-${source}`, `quality-${qualityScore}`, provider || 'unknown'],
        status: "pending",
        submittedBy: "auto-indexer",
      } as any).returning();

      console.log(`[AutoIndexer] ✅ Enviado para curadoria: ${curationItem.id} - "${title}" (quality: ${qualityScore})`);
      console.log(`[AutoIndexer] ⚠️ Aguardando aprovação humana antes de indexar na KB`);

      return true;
    } catch (error: any) {
      console.error(`[AutoIndexer] ❌ Erro ao indexar resposta:`, error.message);
      return false;
    }
  }

  /**
   * Auto-indexa conteúdo de web search (quando AION busca na web)
   * FIXED: Now sends to curation queue instead of direct KB insertion
   */
  async indexWebContent(params: {
    query: string;
    content: string;
    url: string;
  }): Promise<boolean> {
    if (!this.enabled) return false;

    const { query, content, url } = params;

    const shouldIndex = this.evaluateContent(content);
    if (!shouldIndex) return false;

    try {
      const title = this.extractTitle(query, content);
      const qualityScore = this.calculateAutoQualityScore(query, content);
      
      // PHASE 2: Use semantic namespace classification for web content
      const suggestedNamespaces = await this.determineNamespaceSemantic(query, content);
      
      const { curationQueue } = await import("../../shared/schema");

      // Send to curation queue for human review (tenantId defaults to 1 in schema)
      const [curationItem] = await db.insert(curationQueue).values({
        title,
        content,
        suggestedNamespaces,
        tags: [`auto-web`, `quality-${qualityScore}`, url],
        status: "pending",
        submittedBy: "auto-indexer-web",
      } as any).returning();

      console.log(`[AutoIndexer] ✅ Web content sent to curation: ${curationItem.id} - "${title}"`);
      console.log(`[AutoIndexer] ⚠️ Aguardando aprovação humana (URL: ${url})`);
      return true;
    } catch (error: any) {
      console.error(`[AutoIndexer] ❌ Erro ao indexar web content:`, error.message);
      return false;
    }
  }

  /**
   * Auto-indexa uma conversa completa de alta qualidade
   * FIXED: Now sends to curation queue instead of direct KB insertion
   */
  async indexConversation(conversationId: number): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      // Buscar todas as mensagens da conversa
      const allMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);

      // Avaliar qualidade da conversa
      const metrics = ConversationCollector.calculateQualityScore(allMessages);
      
      if (metrics.score < this.minQualityScore) {
        console.log(`[AutoIndexer] Conversa ${conversationId} não atinge qualidade mínima (${metrics.score})`);
        return false;
      }

      // Converter para formato de treino
      const examples = ConversationCollector.convertToTrainingFormat(allMessages);

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, conversationId),
      });

      const { curationQueue } = await import("../../shared/schema");

      // Send each conversation pair to curation queue (tenantId defaults to 1 in schema)
      let queued = 0;
      for (const example of examples) {
        const content = `Pergunta: ${example.instruction}\n\nResposta: ${example.output}`;
        const title = this.extractTitle(example.instruction, example.output);

        // PHASE 2: Use semantic namespace classification for conversations
        const suggestedNamespaces = await this.determineNamespaceSemantic(example.instruction, example.output);

        await db.insert(curationQueue).values({
          title,
          content,
          suggestedNamespaces,
          tags: [`auto-conversation`, `quality-${metrics.score}`],
          status: "pending",
          submittedBy: "auto-indexer-conversation",
        } as any);

        queued++;
      }

      console.log(`[AutoIndexer] ✅ Conversa ${conversationId} enviada para curadoria (${queued} exemplos, score: ${metrics.score})`);
      console.log(`[AutoIndexer] ⚠️ Aguardando aprovação humana antes de indexar`);
      return true;
    } catch (error: any) {
      console.error(`[AutoIndexer] ❌ Erro ao indexar conversa:`, error.message);
      return false;
    }
  }

  /**
   * Avalia se o conteúdo vale a pena ser indexado
   */
  private evaluateContent(content: string): boolean {
    // Critério 1: Tamanho mínimo
    if (content.length < this.minContentLength) {
      return false;
    }

    // Critério 2: Não deve ser resposta genérica/vazia
    const genericPhrases = [
      "desculpe, não posso",
      "não tenho informações",
      "não consigo ajudar",
      "não sei responder",
      "i don't know",
      "i cannot help",
    ];

    const lowerContent = content.toLowerCase();
    if (genericPhrases.some(phrase => lowerContent.includes(phrase))) {
      return false;
    }

    // Critério 3: Deve conter informação substantiva
    const hasSubstantiveContent = content.split(/\s+/).length > 20; // Pelo menos 20 palavras

    return hasSubstantiveContent;
  }

  /**
   * Verifica se conteúdo similar já está indexado (evita duplicação)
   */
  private async checkDuplicate(content: string): Promise<boolean> {
    try {
      // Buscar documentos similares
      const results = await ragService.search(content.substring(0, 500), {
        k: 3,
      });

      // Se encontrar algo com similaridade > 95%, considerar duplicado
      if (results.length > 0 && results[0].score && results[0].score > 0.95) {
        return true;
      }

      return false;
    } catch (error) {
      // Em caso de erro, não bloqueie a indexação
      return false;
    }
  }

  /**
   * Extrai um título adequado do conteúdo
   */
  private extractTitle(query: string, response: string): string {
    // Usar primeiras palavras da pergunta como título
    const words = query.split(/\s+/).slice(0, 8).join(" ");
    
    if (words.length > 0) {
      return words.length > 80 ? words.substring(0, 77) + "..." : words;
    }

    // Fallback: usar primeiras palavras da resposta
    const responseWords = response.split(/\s+/).slice(0, 8).join(" ");
    return responseWords.length > 80 ? responseWords.substring(0, 77) + "..." : responseWords;
  }

  /**
   * PHASE 2: Determina namespace usando classificação semântica (LLM-based)
   * Substitui keyword matching por semantic understanding
   */
  private async determineNamespaceSemantic(query: string, response: string): Promise<string[]> {
    try {
      const combined = `${query}\n\n${response}`;
      const title = this.extractTitle(query, response);
      
      // Call namespace classifier with title and content (2-3 args)
      const classification = await namespaceClassifier.classifyContent(title, combined);
      
      if (classification && classification.confidence >= 50) {
        // Return suggested namespace (high confidence)
        return [classification.suggestedNamespace];
      } else if (classification && classification.existingSimilar.length > 0) {
        // Return most similar existing namespace as fallback
        const mostSimilar = classification.existingSimilar[0];
        if (mostSimilar.similarity >= 70) {
          return [mostSimilar.namespace];
        }
      }
    } catch (error: any) {
      console.warn(`[AutoIndexer] Namespace classification failed, using fallback:`, error.message);
    }
    
    // Fallback: usar namespace padrão "geral"
    return ["geral"];
  }

  /**
   * DEPRECATED: Old keyword-based namespace detection
   * Kept for backward compatibility but not used
   */
  private determineNamespace(query: string, response: string): string {
    const combined = (query + " " + response).toLowerCase();

    // Mapear palavras-chave para namespaces
    const namespaceKeywords: Record<string, string[]> = {
      "tecnologia": ["code", "programming", "software", "api", "database", "tech"],
      "financas": ["money", "finance", "investment", "bank", "crypto", "dinheiro"],
      "saude": ["health", "medical", "doctor", "hospital", "medicine", "saúde"],
      "educacao": ["education", "learn", "study", "school", "university", "educação"],
      "negocios": ["business", "empresa", "negócio", "startup", "marketing"],
    };

    for (const [namespace, keywords] of Object.entries(namespaceKeywords)) {
      if (keywords.some(keyword => combined.includes(keyword))) {
        return namespace;
      }
    }

    return "geral"; // Namespace padrão
  }

  /**
   * Obtém estatísticas do auto-indexer
   */
  async getStats(): Promise<AutoIndexerStats> {
    try {
      // Total de documentos auto-indexados
      const totalDocs = await db
        .select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(sql`${documents.metadata}->>'autoIndexed' = 'true'`);

      // Documentos indexados hoje
      const todayDocs = await db
        .select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(
          sql`${documents.metadata}->>'autoIndexed' = 'true'
              AND ${documents.createdAt} >= NOW() - INTERVAL '1 day'`
        );

      // Último documento indexado
      const lastDoc = await db
        .select()
        .from(documents)
        .where(sql`${documents.metadata}->>'autoIndexed' = 'true'`)
        .orderBy(desc(documents.createdAt))
        .limit(1);

      return {
        totalIndexed: Number(totalDocs[0]?.count || 0),
        indexedToday: Number(todayDocs[0]?.count || 0),
        pendingExamples: 0, // TODO: calcular exemplos pendentes de treino
        lastIndexedAt: lastDoc[0]?.createdAt || undefined,
      };
    } catch (error: any) {
      console.error("[AutoIndexer] Erro ao obter stats:", error.message);
      return {
        totalIndexed: 0,
        indexedToday: 0,
        pendingExamples: 0,
      };
    }
  }

  /**
   * Calcula score de qualidade automático (0-100)
   */
  private calculateAutoQualityScore(userMessage: string, assistantResponse: string): number {
    let score = 0;
    
    // Comprimento da resposta (max 30 pontos)
    score += Math.min((assistantResponse.length / 50), 30);
    
    // Pergunta substancial (max 20 pontos)
    score += Math.min((userMessage.length / 20), 20);
    
    // Sem padrões de baixa qualidade (30 pontos)
    const hasGoodContent = this.evaluateContent(assistantResponse);
    if (hasGoodContent) score += 30;
    
    // Formatação estruturada (20 pontos)
    const hasStructure = /\n|:|-|\*|•|\d+\./g.test(assistantResponse);
    if (hasStructure) score += 20;
    
    return Math.min(Math.round(score), 100);
  }

  /**
   * Ativar/desativar auto-indexação
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[AutoIndexer] ${enabled ? "✅ Ativado" : "❌ Desativado"}`);
  }
}

// Export singleton instance
export const autoIndexer = new AutoIndexer();
