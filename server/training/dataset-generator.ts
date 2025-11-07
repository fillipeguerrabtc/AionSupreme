/**
 * DATASET GENERATOR - Geração Automática de Datasets para Treino
 * 
 * Automaticamente transforma conhecimento em datasets de treino:
 * - Conversas de alta qualidade → JSONL
 * - Documentos da Knowledge Base → JSONL
 * - Formato Alpaca/Instruct para fine-tuning
 * 
 * FLUXO:
 * 1. Monitor detecta novos conteúdos
 * 2. Gera dataset automaticamente
 * 3. Trigger treino quando atingir threshold (ex: 100 exemplos)
 */

import { db } from "../db";
import { documents, conversations, messages, datasets } from "../../shared/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { ConversationCollector, FormattedTrainingExample } from "./collectors/conversation-collector";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getMetaLearningConfig } from "./meta-learning-config";
import { piiRedactionService } from "./pii-redaction-service";
import { replayBufferService } from "./replay-buffer-service";

interface DatasetStats {
  totalExamples: number;
  fromConversations: number;
  fromKnowledgeBase: number;
  lastGeneratedAt?: Date;
  pendingExamples: number;
}

interface GeneratedDataset {
  datasetId: number;
  filepath: string;
  examplesCount: number;
  sources: {
    conversations: number;
    knowledgeBase: number;
  };
}

export class DatasetGenerator {
  private minExamplesForTraining = 15; // Adaptive (will be overridden by config)
  private datasetDir = "/tmp/datasets";
  private enabled = true;

  /**
   * Gera dataset automaticamente a partir de conversas + KB
   * 
   * ENTERPRISE DIAMOND PLUS FEATURES:
   * - Adaptive thresholds (dev/prod/sensitive)
   * - PII auto-redaction
   * - Quality gates
   * - Replay buffer integration
   */
  async generateAutoDataset(): Promise<GeneratedDataset | null> {
    if (!this.enabled) {
      console.log("[DatasetGen] Desabilitado - pulando geração");
      return null;
    }

    console.log("\n🔧 [DatasetGen] Iniciando geração automática de dataset...");
    
    // Load adaptive configuration
    const config = getMetaLearningConfig();
    const threshold = config.thresholds.minExamples;

    try {
      // STEP 1: Coletar conversas de alta qualidade
      const conversationExamples = await this.collectFromConversations();
      console.log(`   ✓ Coletadas ${conversationExamples.length} exemplos de conversas`);

      // STEP 2: Coletar documentos da Knowledge Base
      const kbExamples = await this.collectFromKnowledgeBase();
      console.log(`   ✓ Coletados ${kbExamples.length} exemplos da KB`);

      // STEP 3: Combinar tudo
      let allExamples = [...conversationExamples, ...kbExamples];

      if (allExamples.length < threshold) {
        console.log(`   ⚠ Apenas ${allExamples.length} exemplos - mínimo é ${threshold} (modo: ${config.mode})`);
        console.log("   → Aguardando mais dados antes de gerar dataset");
        return null;
      }

      // STEP 4: Apply Quality Gates
      console.log(`\n   🎯 Aplicando quality gates...`);
      allExamples = allExamples.filter(ex => {
        const outputLen = ex.output.length;
        const instructionLen = ex.instruction.length;
        
        // Check length constraints
        if (outputLen < config.qualityGates.minResponseLength) return false;
        if (outputLen > config.qualityGates.maxResponseLength) return false;
        if (instructionLen < 5) return false; // Minimum instruction length
        
        return true;
      });
      console.log(`   ✓ ${allExamples.length} exemplos passaram quality gates`);

      // STEP 5: Apply PII Redaction
      console.log(`\n   🔐 Aplicando PII redaction...`);
      const redactionStats: any[] = [];
      allExamples = allExamples.map(ex => {
        // Redact instruction
        const instrRedact = piiRedactionService.redact(ex.instruction, config);
        // Redact output
        const outputRedact = piiRedactionService.redact(ex.output, config);
        
        redactionStats.push(instrRedact, outputRedact);
        
        return {
          ...ex,
          instruction: instrRedact.redactedText,
          output: outputRedact.redactedText,
        };
      });
      
      const totalRedactions = redactionStats.reduce((sum, r) => sum + r.redactionCount, 0);
      console.log(`   ✓ ${totalRedactions} PII redactions aplicadas`);

      // STEP 6: Add high-quality examples to Replay Buffer
      console.log(`\n   💾 Adicionando ao Replay Buffer...`);
      let addedToBuffer = 0;
      for (const ex of allExamples) {
        // Assume quality score based on length (simplified)
        const qualityScore = Math.min(100, (ex.output.length / 10));
        
        const added = await replayBufferService.addToBuffer({
          instruction: ex.instruction,
          input: ex.input,
          output: ex.output,
          system: ex.system,
          qualityScore,
        }, config);
        
        if (added) addedToBuffer++;
      }
      console.log(`   ✓ ${addedToBuffer} exemplos adicionados ao buffer`);

      // STEP 7: Mix Replay Buffer with new examples (if enabled)
      const bufferStats = await replayBufferService.getBufferStats();
      console.log(`\n   🔀 Replay Buffer status:`);
      console.log(`      • Buffer size: ${bufferStats.size}/${bufferStats.maxSize}`);
      console.log(`      • Avg quality: ${bufferStats.avgQuality.toFixed(1)}`);

      // STEP 8: Converter para formato JSONL (Alpaca/Instruct)
      const jsonlContent = this.convertToJSONL(allExamples);

      // STEP 5: Salvar arquivo
      await mkdir(this.datasetDir, { recursive: true });
      const filename = `aion_auto_${Date.now()}.jsonl`;
      const filepath = join(this.datasetDir, filename);
      await writeFile(filepath, jsonlContent, "utf-8");

      console.log(`   ✅ Dataset salvo: ${filepath}`);

      // STEP 6: Registrar no banco
      const [dataset] = await db.insert(datasets).values({
        userId: null,
        name: `Auto-generated Dataset ${new Date().toISOString()}`,
        description: `Dataset gerado automaticamente com ${allExamples.length} exemplos`,
        originalFilename: filename,
        fileSize: Buffer.byteLength(jsonlContent, 'utf-8'),
        fileMimeType: "application/jsonl",
        storagePath: filepath,
        datasetType: "instruction",
        status: "ready",
        totalExamples: allExamples.length,
        isValid: true,
      } as any).returning();

      console.log(`   ✅ Dataset registrado no banco: ID ${dataset.id}`);
      console.log(`   📊 Total: ${allExamples.length} exemplos (${conversationExamples.length} conversas + ${kbExamples.length} KB)`);

      return {
        datasetId: dataset.id,
        filepath,
        examplesCount: allExamples.length,
        sources: {
          conversations: conversationExamples.length,
          knowledgeBase: kbExamples.length,
        },
      };
    } catch (error: any) {
      console.error(`[DatasetGen] ❌ Erro ao gerar dataset:`, error.message);
      return null;
    }
  }

  /**
   * Coleta exemplos de conversas de alta qualidade
   */
  private async collectFromConversations(): Promise<FormattedTrainingExample[]> {
    try {
      // Buscar conversas recentes com mensagens
      const recentConversations = await db.query.conversations.findMany({
        orderBy: [desc(conversations.updatedAt)],
        limit: 100, // Últimas 100 conversas
      });

      const allExamples: FormattedTrainingExample[] = [];

      for (const conv of recentConversations) {
        // Buscar mensagens da conversa
        const msgs = await db.query.messages.findMany({
          where: eq(messages.conversationId, conv.id),
          orderBy: [messages.createdAt],
        });

        // Avaliar qualidade
        const metrics = ConversationCollector.calculateQualityScore(msgs);

        // Filtrar apenas conversas de qualidade
        if (ConversationCollector.shouldCollect(metrics)) {
          const examples = ConversationCollector.convertToTrainingFormat(msgs);
          allExamples.push(...examples);
        }
      }

      return allExamples;
    } catch (error: any) {
      console.error(`[DatasetGen] Erro ao coletar conversas:`, error.message);
      return [];
    }
  }

  /**
   * Coleta exemplos da Knowledge Base
   * Transforma documentos em pares pergunta-resposta sintéticos
   */
  private async collectFromKnowledgeBase(): Promise<FormattedTrainingExample[]> {
    try {
      // Buscar documentos auto-indexados (recentes)
      const docs = await db.query.documents.findMany({
        where: eq(documents.status, "indexed"),
        orderBy: [desc(documents.createdAt)],
        limit: 200, // Últimos 200 docs
      });

      const examples: FormattedTrainingExample[] = [];

      for (const doc of docs) {
        // Se documento tem metadata de conversa original, usar como contexto
        if (doc.metadata && typeof doc.metadata === 'object') {
          const meta = doc.metadata as Record<string, any>;
          
          if (meta.userMessage && meta.autoIndexed) {
            // Documento vem de auto-indexação de conversa
            examples.push({
              instruction: meta.userMessage,
              output: doc.content,
              system: "Você é AION, um assistente de IA autônomo, inteligente e útil.",
            });
          } else if (meta.query) {
            // Documento vem de web search
            examples.push({
              instruction: meta.query,
              output: doc.content,
              system: "Você é AION, um assistente de IA autônomo, inteligente e útil.",
            });
          } else {
            // Documento genérico - criar pergunta sintética
            const syntheticQuestion = this.generateSyntheticQuestion(doc.title, doc.content);
            examples.push({
              instruction: syntheticQuestion,
              output: doc.content.substring(0, 2000), // Limitar tamanho
              system: "Você é AION, um assistente de IA autônomo, inteligente e útil.",
            });
          }
        }
      }

      return examples;
    } catch (error: any) {
      console.error(`[DatasetGen] Erro ao coletar KB:`, error.message);
      return [];
    }
  }

  /**
   * Gera pergunta sintética baseada no título e conteúdo
   */
  private generateSyntheticQuestion(title: string, content: string): string {
    // Templates de perguntas
    const templates = [
      `Explique sobre: ${title}`,
      `O que você sabe sobre ${title}?`,
      `Me fale sobre ${title}`,
      `Descreva ${title}`,
      `Quais informações você tem sobre ${title}?`,
    ];

    // Escolher template aleatório
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template;
  }

  /**
   * Converte exemplos para formato JSONL (Alpaca/Instruct)
   */
  private convertToJSONL(examples: FormattedTrainingExample[]): string {
    const lines: string[] = [];

    for (const ex of examples) {
      // Formato Alpaca/Instruct
      const formatted = {
        instruction: ex.instruction,
        input: ex.input || "",
        output: ex.output,
        system: ex.system || "Você é AION, um assistente de IA autônomo, inteligente e útil.",
      };

      // Adicionar contexto se disponível
      if (ex.context) {
        formatted.input = `Contexto:\n${ex.context}\n\n${formatted.input}`;
      }

      lines.push(JSON.stringify(formatted));
    }

    return lines.join("\n");
  }

  /**
   * Verifica se há exemplos suficientes para gerar dataset
   */
  async checkPendingExamples(): Promise<number> {
    try {
      // Contar training examples aprovados que não foram usados ainda
      const { trainingDataCollection } = await import("../../shared/schema");
      
      // HITL FIX: Only count 'approved' training data (not 'pending')
      // This enforces that only human-approved content goes to training
      const approvedExamples = await db
        .select({ count: sql<number>`count(*)` })
        .from(trainingDataCollection)
        .where(
          and(
            eq(trainingDataCollection.status, 'approved'), // ONLY approved!
            sql`${trainingDataCollection.datasetId} IS NULL` // Não foi usado em dataset ainda
          )
        );

      const totalPending = Number(approvedExamples[0]?.count || 0);
      
      console.log(`[DatasetGen] 📊 Training examples prontos: ${totalPending}`);
      
      return totalPending;
    } catch (error: any) {
      console.error(`[DatasetGen] Erro ao contar exemplos:`, error.message);
      return 0;
    }
  }

  /**
   * Obtém estatísticas do gerador
   */
  async getStats(): Promise<DatasetStats> {
    try {
      // Total de datasets gerados
      const allDatasets = await db.query.datasets.findMany({
        orderBy: [desc(datasets.createdAt)],
      });

      // Último dataset
      const lastDataset = allDatasets[0];

      // Contar exemplos pendentes
      const pendingExamples = await this.checkPendingExamples();

      // Somar exemplos por fonte
      let fromConversations = 0;
      let fromKnowledgeBase = 0;

      for (const ds of allDatasets) {
        // Count total examples from dataset
        fromConversations += ds.totalExamples || 0;
      }

      const totalExamples = fromConversations + fromKnowledgeBase;

      return {
        totalExamples,
        fromConversations,
        fromKnowledgeBase,
        lastGeneratedAt: lastDataset?.createdAt,
        pendingExamples,
      };
    } catch (error: any) {
      console.error("[DatasetGen] Erro ao obter stats:", error.message);
      return {
        totalExamples: 0,
        fromConversations: 0,
        fromKnowledgeBase: 0,
        pendingExamples: 0,
      };
    }
  }

  /**
   * Ativar/desativar geração automática
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[DatasetGen] ${enabled ? "✅ Ativado" : "❌ Desativado"}`);
  }

  /**
   * Configurar threshold mínimo de exemplos
   */
  setMinExamples(min: number): void {
    this.minExamplesForTraining = min;
    console.log(`[DatasetGen] Threshold atualizado: ${min} exemplos`);
  }
}

// Export singleton
export const datasetGenerator = new DatasetGenerator();
