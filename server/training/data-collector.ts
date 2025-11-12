/**
 * Training Data Collector - Coleta de Dados para Fine-Tuning LoRA
 * 
 * Coleta conversas de alta qualidade do banco de dados e exporta para
 * formato JSONL compatível com fine-tuning de modelos (Llama-3-8B + LoRA).
 * 
 * Formato de saída (Alpaca/Instruct):
 * {
 *   "instruction": "Pergunta do usuário",
 *   "input": "",
 *   "output": "Resposta do assistente"
 * }
 * 
 * Documentação: docs/FREE_GPU_API_STRATEGY.md
 */

import { storage } from "../storage";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

export interface TrainingExample {
  instruction: string;
  input: string; // Geralmente vazio para chat
  output: string;
  metadata?: {
    conversationId?: number;
    messageId?: number;
    timestamp?: Date;
    rating?: number; // Qualidade da resposta (1-5)
  };
}

export interface CollectionCriteria {
  minTokens?: number; // Mínimo de tokens por mensagem
  maxTokens?: number; // Máximo de tokens por mensagem
  minRating?: number; // Qualidade mínima (1-5)
  excludePatterns?: string[]; // Padrões a excluir (censura, etc.)
  includeSystemPrompts?: boolean; // Incluir contexto do system
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export class TrainingDataCollector {
  private dataDir = "./training/data";

  constructor() {
    // 🔒 SYNCHRONOUS INITIALIZATION - Prevents ENOENT race on first export
    this.ensureDataDirSync();
  }

  /**
   * Garantir que diretório de dados existe (SYNCHRONOUS - safe for constructor)
   * 
   * ENTERPRISE FIX: Prevents race condition where first export() hits ENOENT
   * before async ensureDataDir() completes.
   */
  private ensureDataDirSync(): void {
    try {
      fsSync.mkdirSync(this.dataDir, { recursive: true });
    } catch (error) {
      console.error("[Training] Erro criando diretório de dados:", error);
    }
  }

  /**
   * Coletar dados de treino do banco de dados
   */
  async collectTrainingData(
    criteria: CollectionCriteria = {}
  ): Promise<TrainingExample[]> {
    console.log(`[Training] Coletando dados de treino...`);

    const examples: TrainingExample[] = [];

    // Buscar conversas
    const conversations = await storage.getConversations(
      criteria.limit || 1000
    );

    for (const conversation of conversations) {
      // Buscar mensagens da conversação
      const messages = await storage.getMessagesByConversation(conversation.id);

      // Filtrar apenas pares user→assistant
      for (let i = 0; i < messages.length - 1; i++) {
        const userMsg = messages[i];
        const assistantMsg = messages[i + 1];

        // Validar par user→assistant
        if (userMsg.role !== "user" || assistantMsg.role !== "assistant") {
          continue;
        }

        // Aplicar critérios de filtragem
        if (!this.meetsCriteria(userMsg.content, assistantMsg.content, criteria)) {
          continue;
        }

        // Criar exemplo de treino
        examples.push({
          instruction: userMsg.content,
          input: "", // Vazio para chat simples
          output: assistantMsg.content,
          metadata: {
            conversationId: conversation.id,
            messageId: assistantMsg.id,
            timestamp: new Date(assistantMsg.createdAt),
            // TODO: Adicionar rating se disponível
          },
        });
      }
    }

    console.log(`[Training] ✓ ${examples.length} exemplos coletados`);
    return examples;
  }

  /**
   * Verificar se par de mensagens atende critérios
   */
  private meetsCriteria(
    userMsg: string,
    assistantMsg: string,
    criteria: CollectionCriteria
  ): boolean {
    // Tamanho mínimo/máximo
    const userTokens = this.estimateTokens(userMsg);
    const assistantTokens = this.estimateTokens(assistantMsg);

    if (criteria.minTokens && (userTokens < criteria.minTokens || assistantTokens < criteria.minTokens)) {
      return false;
    }

    if (criteria.maxTokens && (userTokens > criteria.maxTokens || assistantTokens > criteria.maxTokens)) {
      return false;
    }

    // Excluir padrões indesejados
    if (criteria.excludePatterns) {
      for (const pattern of criteria.excludePatterns) {
        if (userMsg.includes(pattern) || assistantMsg.includes(pattern)) {
          return false;
        }
      }
    }

    // Excluir respostas de erro
    if (
      assistantMsg.includes("I cannot") ||
      assistantMsg.includes("I'm not able to") ||
      assistantMsg.includes("I apologize") ||
      assistantMsg.toLowerCase().includes("error")
    ) {
      return false;
    }

    return true;
  }

  /**
   * Estimar número de tokens (aproximado)
   * ~1 token = 4 caracteres para inglês/português
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Exportar dados para arquivo JSONL
   */
  async exportToJSONL(
    examples: TrainingExample[],
    filename?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filepath = path.join(
      this.dataDir,
      filename || `training_${timestamp}.jsonl`
    );

    // Converter para JSONL (uma linha por exemplo)
    const jsonl = examples
      .map((example) => {
        // Remover metadata para arquivo de treino (apenas instruction/input/output)
        const { metadata, ...trainingData } = example;
        return JSON.stringify(trainingData);
      })
      .join("\n");

    await fs.writeFile(filepath, jsonl, "utf-8");

    console.log(`[Training] ✓ Arquivo JSONL salvo: ${filepath}`);
    console.log(`[Training] ✓ ${examples.length} exemplos exportados`);

    return filepath;
  }

  /**
   * Exportar dados no formato Alpaca (mais comum)
   */
  async exportToAlpacaJSON(
    examples: TrainingExample[],
    filename?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filepath = path.join(
      this.dataDir,
      filename || `training_alpaca_${timestamp}.json`
    );

    // Remover metadata
    const trainingData = examples.map(({ metadata, ...example }) => example);

    await fs.writeFile(filepath, JSON.stringify(trainingData, null, 2), "utf-8");

    console.log(`[Training] ✓ Arquivo JSON (Alpaca) salvo: ${filepath}`);
    console.log(`[Training] ✓ ${examples.length} exemplos exportados`);

    return filepath;
  }

  /**
   * Gerar estatísticas sobre dataset
   */
  async generateStats(examples: TrainingExample[]): Promise<{
    totalExamples: number;
    avgInstructionLength: number;
    avgOutputLength: number;
    totalTokens: number;
    qualityDistribution: Record<number, number>;
  }> {
    const totalExamples = examples.length;
    
    let totalInstructionChars = 0;
    let totalOutputChars = 0;
    let totalTokens = 0;
    const qualityDistribution: Record<number, number> = {};

    for (const example of examples) {
      totalInstructionChars += example.instruction.length;
      totalOutputChars += example.output.length;
      totalTokens += this.estimateTokens(example.instruction) + this.estimateTokens(example.output);

      const rating = example.metadata?.rating || 0;
      qualityDistribution[rating] = (qualityDistribution[rating] || 0) + 1;
    }

    return {
      totalExamples,
      avgInstructionLength: Math.round(totalInstructionChars / totalExamples),
      avgOutputLength: Math.round(totalOutputChars / totalExamples),
      totalTokens,
      qualityDistribution,
    };
  }

  /**
   * Validar dataset antes de treinar
   */
  async validateDataset(examples: TrainingExample[]): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Verificar tamanho mínimo
    if (examples.length < 100) {
      warnings.push(`Dataset pequeno: ${examples.length} exemplos (recomendado: >1000)`);
    }

    // Verificar exemplos vazios
    const emptyExamples = examples.filter(
      (e) => !e.instruction.trim() || !e.output.trim()
    );
    if (emptyExamples.length > 0) {
      errors.push(`${emptyExamples.length} exemplos com texto vazio`);
    }

    // Verificar duplicatas
    const instructionSet = new Set(examples.map((e) => e.instruction));
    if (instructionSet.size < examples.length) {
      warnings.push(
        `${examples.length - instructionSet.size} instruções duplicadas encontradas`
      );
    }

    // Verificar comprimento extremo
    const tooLong = examples.filter(
      (e) => this.estimateTokens(e.instruction) > 2048 || this.estimateTokens(e.output) > 2048
    );
    if (tooLong.length > 0) {
      warnings.push(`${tooLong.length} exemplos com >2048 tokens (serão truncados)`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Preparar dataset completo para fine-tuning
   */
  async prepareDataset(
    criteria?: CollectionCriteria
  ): Promise<{
    filepath: string;
    stats: {
      totalExamples: number;
      avgInstructionLength: number;
      avgOutputLength: number;
      totalTokens: number;
      qualityDistribution: Record<number, number>;
    };
    validation: {
      valid: boolean;
      errors: string[];
      warnings: string[];
    };
  }> {
    console.log("[Training] Preparando dataset para fine-tuning...");

    // 1. Coletar dados
    const examples = await this.collectTrainingData(criteria);

    // 2. Validar
    const validation = await this.validateDataset(examples);
    
    if (!validation.valid) {
      throw new Error(`Dataset inválido: ${validation.errors.join(", ")}`);
    }

    // 3. Gerar estatísticas
    const stats = await this.generateStats(examples);

    // 4. Exportar
    const filepath = await this.exportToJSONL(examples);

    console.log("[Training] ✓ Dataset preparado com sucesso!");
    console.log(`[Training]   - ${stats.totalExamples} exemplos`);
    console.log(`[Training]   - ~${stats.totalTokens.toLocaleString()} tokens totais`);
    console.log(`[Training]   - Arquivo: ${filepath}`);

    return {
      filepath,
      stats,
      validation,
    };
  }
}

// Singleton instance
export const trainingDataCollector = new TrainingDataCollector();
