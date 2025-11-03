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
   */
  async onChatCompleted(payload: {
    conversationId: number | null;
    userMessage: string;
    assistantResponse: string;
    source: "kb" | "gpu" | "free-api" | "web" | "openai";
    provider?: string;
  }): Promise<void> {
    if (!this.enabled) return;

    console.log(`\n📝 [AutoLearning] Chat completado - indexando conhecimento...`);

    try {
      // ✅ PRODUCTION-READY: Send to curation queue for HITL review
      // High-quality conversations go through human approval before KB indexing
      const { curationStore } = await import("../curation/store");
      
      const conversationContent = `Q: ${payload.userMessage}\n\nA: ${payload.assistantResponse}`;
      
      const item = await curationStore.addToCuration({
        title: payload.userMessage.substring(0, 100),
        content: conversationContent,
        suggestedNamespaces: ["chat/conversations"],
        tags: ["chat", payload.source, payload.provider || "unknown"],
        submittedBy: "auto-learning",
      });
      
      console.log(`   ✅ Chat enviado para fila de curadoria (ID: ${item.id})`);
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
