/**
 * AUTO-LEARNING LISTENER - Escuta TODAS as fontes de dados
 * 
 * Automaticamente indexa e transforma em datasets:
 * ✅ Conversas do chat
 * ✅ Texto digitado manualmente
 * ✅ URLs/Links inseridos
 * ✅ Arquivos uploaded (PDF, DOCX, etc)
 * ✅ Buscas na web
 * ✅ Respostas de APIs externas
 * 
 * FLUXO:
 * 1. Evento disparado (DOC_INGESTED, CHAT_COMPLETED, etc)
 * 2. AutoIndexer avalia e indexa na KB
 * 3. DatasetGenerator verifica threshold
 * 4. Se threshold OK → AutoTrainingTrigger dispara treino
 */

import { autoIndexer } from "../training/auto-indexer";
import { datasetGenerator } from "../training/dataset-generator";
import { autoTrainingTrigger } from "../training/auto-training-trigger";

interface EventPayload {
  type: "chat" | "document" | "url" | "file" | "web_search" | "api_response";
  data: any;
}

export class AutoLearningListener {
  private enabled = true;

  /**
   * Inicia listeners de eventos
   */
  start(): void {
    console.log("\n🎓 [AutoLearning] Sistema de aprendizado contínuo ATIVADO");
    console.log("   📥 Escutando TODAS as fontes de dados...");
    console.log("   🔄 Chat → KB → Dataset → Treino → Modelo melhor → Repete ♾️\n");
  }

  /**
   * Processa evento de CHAT COMPLETADO
   * 
   * COMPORTAMENTO:
   * - Se conversationId EXISTS: NÃO enviar para curadoria (aguardar consolidação)
   * - Se conversationId NULL: enviar imediatamente (mensagens standalone)
   */
  async onChatCompleted(payload: {
    conversationId: number | null;
    userMessage: string;
    assistantResponse: string;
    source: "kb" | "gpu" | "free-api" | "web" | "openai";
    provider?: string;
  }): Promise<void> {
    if (!this.enabled) return;

    console.log(`\n📝 [AutoLearning] Chat completado (conversationId: ${payload.conversationId || 'null'})...`);

    try {
      // ✅ NEW BEHAVIOR: Defer submission for conversation-linked messages
      // They will be consolidated and submitted by ConversationFinalizer
      if (payload.conversationId !== null) {
        console.log(`   ⏳ Conversa ${payload.conversationId} - aguardando consolidação`);
        console.log(`   💡 Mensagem será incluída na transcrição completa da conversa`);
        
        // Update conversation's lastActivityAt to track activity
        const { db } = await import("../db");
        const { conversations } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        
        await db.update(conversations)
          .set({ lastActivityAt: new Date() })
          .where(eq(conversations.id, payload.conversationId));
        
        return; // Exit early - don't send to curation queue yet
      }

      // ✅ STANDALONE MESSAGES: Send immediately (no conversationId)
      console.log(`   📤 Mensagem standalone - enviando para curadoria imediatamente`);
      
      const { curationStore } = await import("../curation/store");
      const { namespaceClassifier } = await import("../services/namespace-classifier");
      
      const conversationContent = `Q: ${payload.userMessage}\n\nA: ${payload.assistantResponse}`;
      
      // 🔥 FIX: Use SEMANTIC classification instead of hardcoded source-based namespace
      let suggestedNamespaces: string[] = ["geral"]; // Fallback
      try {
        const classification = await namespaceClassifier.classifyContent(
          payload.userMessage.substring(0, 100),
          conversationContent,
          1 // tenantId
        );
        suggestedNamespaces = [classification.suggestedNamespace];
        console.log(`   🧠 Namespace classified semantically: ${classification.suggestedNamespace} (confidence: ${classification.confidence}%)`);
      } catch (classifyError: any) {
        console.warn(`   ⚠️ Namespace classification failed, using fallback:`, classifyError.message);
      }
      
      // 🔥 P1.1.2g: Handle potential duplicate errors via centralized helper
      const { DuplicateContentError } = await import("../errors/DuplicateContentError");
      
      let item: any;
      try {
        item = await curationStore.addToCuration({
          title: payload.userMessage.substring(0, 100),
          content: conversationContent,
          suggestedNamespaces, // 🔥 SEMANTIC namespaces, not source-based!
          tags: ["chat", "standalone", payload.source, payload.provider || "unknown"],
          submittedBy: "auto-learning",
        });
      } catch (error: any) {
        // Use centralized helper instead of duplicating persistence logic
        if (error instanceof DuplicateContentError) {
          item = await curationStore.persistRejection({
            title: payload.userMessage.substring(0, 100),
            content: conversationContent,
            suggestedNamespaces,
            tags: ["chat", "standalone", payload.source, payload.provider || "unknown"],
            submittedBy: "auto-learning",
          }, error);
        } else {
          throw error; // Re-throw other errors
        }
      }
      
      console.log(`   ✅ Mensagem standalone enviada para curadoria (ID: ${item.id})`);
      console.log(`   ⚠️ Aguardando aprovação HITL antes de indexar na KB`);

      // REMOVED: Direct KB indexing bypass
      // Content must be approved through curation queue before indexing
      // Dataset generation will be triggered after HITL approval
    } catch (error: any) {
      console.error(`[AutoLearning] Erro ao processar chat:`, error.message);
    }
  }

  /**
   * Processa evento de DOCUMENTO ADICIONADO (texto, URL, arquivo)
   */
  async onDocumentIngested(payload: {
    documentId: number;
    title: string;
    content: string;
    source: "manual" | "url" | "file" | "web";
  }): Promise<void> {
    if (!this.enabled) return;

    console.log(`\n📄 [AutoLearning] Documento ingerido - preparando para treino...`);

    try {
      // Documento já está na KB (foi adicionado manualmente)
      // Apenas verificar se deve gerar dataset
      console.log(`   ✅ Documento na KB: "${payload.title}"`);
      await this.checkAndTriggerDatasetGeneration();
    } catch (error: any) {
      console.error(`[AutoLearning] Erro ao processar documento:`, error.message);
    }
  }

  /**
   * Processa evento de WEB SEARCH
   */
  async onWebSearchCompleted(payload: {
    query: string;
    results: Array<{ title: string; url: string; snippet: string }>;
  }): Promise<void> {
    if (!this.enabled) return;

    console.log(`\n🔍 [AutoLearning] Web search completado - indexando resultados...`);

    try {
      let indexed = 0;

      // Indexar cada resultado relevante
      for (const result of payload.results.slice(0, 3)) {
        const success = await autoIndexer.indexWebContent({
          query: payload.query,
          content: result.snippet,
          url: result.url,
        });

        if (success) indexed++;
      }

      console.log(`   ✅ ${indexed} resultados indexados`);
      
      if (indexed > 0) {
        await this.checkAndTriggerDatasetGeneration();
      }
    } catch (error: any) {
      console.error(`[AutoLearning] Erro ao processar web search:`, error.message);
    }
  }

  /**
   * Verifica threshold e dispara geração de dataset se necessário
   */
  private async checkAndTriggerDatasetGeneration(): Promise<void> {
    try {
      const pending = await datasetGenerator.checkPendingExamples();
      
      if (pending >= 100) {
        console.log(`\n   🎯 THRESHOLD ATINGIDO! (${pending} exemplos pendentes)`);
        console.log("   → Disparando geração automática de dataset...");
        
        // Gerar dataset
        const dataset = await datasetGenerator.generateAutoDataset();
        
        if (dataset) {
          console.log(`   ✅ Dataset gerado: ${dataset.examplesCount} exemplos`);
          console.log("   → AutoTrainingTrigger vai iniciar treino em breve...");
        }
      } else {
        console.log(`   📊 Exemplos pendentes: ${pending}/100 (aguardando mais dados)`);
      }
    } catch (error: any) {
      console.error(`[AutoLearning] Erro ao verificar threshold:`, error.message);
    }
  }

  /**
   * Ativar/desativar sistema
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[AutoLearning] ${enabled ? "✅ ATIVADO" : "❌ DESATIVADO"}`);
  }
}

// Export singleton
export const autoLearningListener = new AutoLearningListener();
