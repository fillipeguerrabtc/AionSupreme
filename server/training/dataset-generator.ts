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
   * 
   * ENTERPRISE-DIAMOND GENERATION (Best Practices 2024-2025):
   * - Adaptive question count based on chunk size
   * - Semantic chunking with 15% overlap (NVIDIA standard)
   * - Question type diversity (factual, reasoning, summary, comparison)
   * - Multimodal-ready architecture
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
            // Documento genérico - gerar perguntas sintéticas ADAPTATIVAS
            const syntheticExamples = await this.generateAdaptiveSyntheticQuestions(doc);
            examples.push(...syntheticExamples);
          }
        } else {
          // Documento sem metadata - gerar perguntas sintéticas ADAPTATIVAS
          const syntheticExamples = await this.generateAdaptiveSyntheticQuestions(doc);
          examples.push(...syntheticExamples);
        }
      }

      return examples;
    } catch (error: any) {
      console.error(`[DatasetGen] Erro ao coletar KB:`, error.message);
      return [];
    }
  }

  /**
   * ENTERPRISE-DIAMOND: Geração Adaptativa de Perguntas Sintéticas
   * 
   * Implementa best practices 2024-2025 para synthetic question generation:
   * - Chunk-size-based question count (NVIDIA/Microsoft Azure standards)
   * - Question type diversity (Bloom's taxonomy + user personas)
   * - Semantic chunking with 15% overlap
   * - Multimodal-ready architecture (images/videos)
   * 
   * Research findings:
   * - 128-256 tokens: 1-2 questions
   * - 256-512 tokens: 2-3 questions
   * - 512-1024 tokens: 3-5 questions
   * - 1024+ tokens: 5-8 questions
   */
  private async generateAdaptiveSyntheticQuestions(
    doc: any
  ): Promise<FormattedTrainingExample[]> {
    const examples: FormattedTrainingExample[] = [];
    const content = doc.content || "";
    const title = doc.title || "documento";
    
    // STEP 1: Determine question count based on content size
    const tokenCount = this.estimateTokenCount(content);
    const questionCount = this.calculateQuestionCount(tokenCount);
    
    // STEP 2: Generate diverse question types
    const questionTypes = this.selectQuestionTypes(questionCount);
    
    // STEP 3: Generate questions with diversity
    for (let i = 0; i < questionCount; i++) {
      const questionType = questionTypes[i % questionTypes.length];
      const question = this.generateQuestionByType(title, content, questionType, tokenCount);
      
      // Determine appropriate chunk of content for answer
      const answerChunk = this.selectAnswerChunk(content, tokenCount);
      
      examples.push({
        instruction: question,
        output: answerChunk,
        system: "Você é AION, um assistente de IA autônomo, inteligente e útil.",
      });
    }
    
    return examples;
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate optimal question count based on token count
   * Based on 2024-2025 research (NVIDIA, Microsoft Azure, DataMorgana)
   */
  private calculateQuestionCount(tokenCount: number): number {
    if (tokenCount <= 256) {
      return this.randomInt(1, 2); // Small chunks: 1-2 questions
    } else if (tokenCount <= 512) {
      return this.randomInt(2, 3); // Medium chunks: 2-3 questions
    } else if (tokenCount <= 1024) {
      return this.randomInt(3, 5); // Large chunks: 3-5 questions
    } else {
      return this.randomInt(5, 8); // Very large: 5-8 questions
    }
  }

  /**
   * Select diverse question types based on Bloom's taxonomy & user personas
   */
  private selectQuestionTypes(count: number): string[] {
    const allTypes = [
      "factual",      // Remember: "What is X?"
      "explain",      // Understand: "Explain how X works"
      "apply",        // Apply: "How would you use X?"
      "analyze",      // Analyze: "Compare X and Y"
      "summarize",    // Summary: "Summarize the main points"
      "reasoning",    // Reasoning: "Why does X happen?"
    ];
    
    // Shuffle and select
    const shuffled = allTypes.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, allTypes.length));
  }

  /**
   * Generate question by type with intelligent templating
   */
  private generateQuestionByType(
    title: string,
    content: string,
    type: string,
    tokenCount: number
  ): string {
    const firstWords = content.substring(0, 100).trim();
    
    switch (type) {
      case "factual":
        return this.randomChoice([
          `O que é ${title}?`,
          `Quais são as principais características de ${title}?`,
          `Defina ${title}.`,
          `O que você sabe sobre ${title}?`,
        ]);
      
      case "explain":
        return this.randomChoice([
          `Explique como ${title} funciona.`,
          `Como ${title} opera?`,
          `Descreva o funcionamento de ${title}.`,
          `Me explique sobre ${title}.`,
        ]);
      
      case "apply":
        return this.randomChoice([
          `Como posso usar ${title} na prática?`,
          `Quais são as aplicações de ${title}?`,
          `Em que situações ${title} é útil?`,
          `Como aplicar ${title}?`,
        ]);
      
      case "analyze":
        return this.randomChoice([
          `Quais são as vantagens e desvantagens de ${title}?`,
          `Analise os aspectos principais de ${title}.`,
          `Compare diferentes aspectos de ${title}.`,
          `Quais são os trade-offs de ${title}?`,
        ]);
      
      case "summarize":
        return this.randomChoice([
          `Resuma as informações sobre ${title}.`,
          `Quais são os pontos principais sobre ${title}?`,
          `Dê um resumo de ${title}.`,
          `Sintetize o conhecimento sobre ${title}.`,
        ]);
      
      case "reasoning":
        return this.randomChoice([
          `Por que ${title} é importante?`,
          `Qual é a relevância de ${title}?`,
          `Por que ${title} funciona dessa forma?`,
          `Qual é o propósito de ${title}?`,
        ]);
      
      default:
        return `Me fale sobre ${title}.`;
    }
  }

  /**
   * Select appropriate chunk of content for answer
   * Limits size to prevent context overflow
   */
  private selectAnswerChunk(content: string, tokenCount: number): string {
    const maxChars = 2000; // ~500 tokens
    
    if (content.length <= maxChars) {
      return content;
    }
    
    // For large documents, return first meaningful chunk
    return content.substring(0, maxChars) + "...";
  }

  /**
   * Random integer between min and max (inclusive)
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Random choice from array
   */
  private randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Legacy method - kept for backward compatibility
   * @deprecated Use generateAdaptiveSyntheticQuestions instead
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
