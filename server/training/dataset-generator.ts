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
  private minExamplesForTraining = 50; // Mínimo de exemplos para disparar treino
  private datasetDir = "/tmp/datasets";
  private enabled = true;

  /**
   * Gera dataset automaticamente a partir de conversas + KB
   */
  async generateAutoDataset(tenantId: number): Promise<GeneratedDataset | null> {
    if (!this.enabled) {
      console.log("[DatasetGen] Desabilitado - pulando geração");
      return null;
    }

    console.log("\n🔧 [DatasetGen] Iniciando geração automática de dataset...");

    try {
      // STEP 1: Coletar conversas de alta qualidade
      const conversationExamples = await this.collectFromConversations(tenantId);
      console.log(`   ✓ Coletadas ${conversationExamples.length} exemplos de conversas`);

      // STEP 2: Coletar documentos da Knowledge Base
      const kbExamples = await this.collectFromKnowledgeBase(tenantId);
      console.log(`   ✓ Coletados ${kbExamples.length} exemplos da KB`);

      // STEP 3: Combinar tudo
      const allExamples = [...conversationExamples, ...kbExamples];

      if (allExamples.length < this.minExamplesForTraining) {
        console.log(`   ⚠ Apenas ${allExamples.length} exemplos - mínimo é ${this.minExamplesForTraining}`);
        console.log("   → Aguardando mais dados antes de gerar dataset");
        return null;
      }

      // STEP 4: Converter para formato JSONL (Alpaca/Instruct)
      const jsonlContent = this.convertToJSONL(allExamples);

      // STEP 5: Salvar arquivo
      await mkdir(this.datasetDir, { recursive: true });
      const filename = `aion_auto_${Date.now()}.jsonl`;
      const filepath = join(this.datasetDir, filename);
      await writeFile(filepath, jsonlContent, "utf-8");

      console.log(`   ✅ Dataset salvo: ${filepath}`);

      // STEP 6: Registrar no banco
      const [dataset] = await db.insert(datasets).values({
        tenantId,
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
  private async collectFromConversations(tenantId: number): Promise<FormattedTrainingExample[]> {
    try {
      // Buscar conversas recentes com mensagens
      const recentConversations = await db.query.conversations.findMany({
        where: eq(conversations.tenantId, tenantId),
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
  private async collectFromKnowledgeBase(tenantId: number): Promise<FormattedTrainingExample[]> {
    try {
      // Buscar documentos auto-indexados (recentes)
      const docs = await db.query.documents.findMany({
        where: and(
          eq(documents.tenantId, tenantId),
          eq(documents.status, "indexed")
        ),
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
  async checkPendingExamples(tenantId: number): Promise<number> {
    try {
      // Contar conversas de qualidade desde último dataset
      const lastDataset = await db.query.datasets.findFirst({
        where: eq(datasets.tenantId, tenantId),
        orderBy: [desc(datasets.createdAt)],
      });

      const since = lastDataset?.createdAt || new Date(0);

      // Contar conversas recentes
      const recentConvs = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, tenantId),
            gte(conversations.updatedAt, since)
          )
        );

      // Contar documentos recentes
      const recentDocs = await db
        .select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(
          and(
            eq(documents.tenantId, tenantId),
            eq(documents.status, "indexed"),
            gte(documents.createdAt, since)
          )
        );

      const totalPending = Number(recentConvs[0]?.count || 0) + Number(recentDocs[0]?.count || 0);
      return totalPending;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Obtém estatísticas do gerador
   */
  async getStats(tenantId: number): Promise<DatasetStats> {
    try {
      // Total de datasets gerados
      const allDatasets = await db.query.datasets.findMany({
        where: eq(datasets.tenantId, tenantId),
        orderBy: [desc(datasets.createdAt)],
      });

      // Último dataset
      const lastDataset = allDatasets[0];

      // Contar exemplos pendentes
      const pendingExamples = await this.checkPendingExamples(tenantId);

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
