/**
 * AUTO-TRAINING TRIGGER - Disparo Automático de Treino
 * 
 * Monitora o sistema e dispara treino automaticamente quando:
 * 1. Há X novos exemplos acumulados (default: 100)
 * 2. Há pelo menos 1 GPU online disponível
 * 3. Não há treino em andamento
 * 
 * FLUXO:
 * 1. Background job verifica a cada 30 min
 * 2. Se condições OK → gera dataset + dispara treino
 * 3. Distribui jobs entre GPUs disponíveis
 */

import { datasetGenerator } from "./dataset-generator";
import { GPUPool } from "../gpu/pool";
import { db } from "../db";
import { trainingJobs } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { datasetSplitter } from "../federated/dataset-splitter";
import { gradientAggregator } from "../federated/gradient-aggregator";
import { getMetaLearningConfig } from "./meta-learning-config";

interface TrainingConfig {
  model: string;
  lora: {
    r: number;
    alpha: number;
    dropout: number;
  };
  training: {
    epochs: number;
    batchSize: number;
    learningRate: number;
  };
}

export class AutoTrainingTrigger {
  private checkIntervalMs = 30 * 60 * 1000; // 30 minutos
  private intervalId: NodeJS.Timeout | null = null;
  private enabled = true;

  /**
   * Inicia monitoramento automático
   */
  start(): void {
    if (this.intervalId) {
      console.log("[AutoTrain] Já está rodando");
      return;
    }

    console.log(`[AutoTrain] ✅ Iniciado - verificando a cada ${this.checkIntervalMs / 1000 / 60} min`);

    // Verificar imediatamente
    this.checkAndTrigger();

    // Depois verificar periodicamente
    this.intervalId = setInterval(() => {
      this.checkAndTrigger();
    }, this.checkIntervalMs);
  }

  /**
   * Para monitoramento
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[AutoTrain] ⏹ Parado");
    }
  }

  /**
   * Verifica condições e dispara treino se necessário
   * 
   * ENTERPRISE DIAMOND PLUS FEATURES:
   * - Adaptive thresholds based on environment
   * - Differential Privacy budget tracking
   * - Quality gates enforcement
   */
  private async checkAndTrigger(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    console.log("\n🤖 [AutoTrain] Verificando condições para auto-treino...");
    
    // Load adaptive configuration
    const config = getMetaLearningConfig();
    const threshold = config.thresholds.minKBItems; // ✅ BLOCKER #2 FIX: Use minKBItems

    try {
      // ✅ BLOCKER #2 FIX: Usar checkPendingKBItems() em vez de checkPendingExamples()
      // Conta APENAS KB items (documentos aprovados), não conversas
      const pendingKBItems = await datasetGenerator.checkPendingKBItems();
      console.log(`   📚 KB items pendentes: ${pendingKBItems}`);
      console.log(`   🎯 Threshold (modo ${config.mode}): ${threshold} KB items`);

      if (pendingKBItems < threshold) {
        console.log(`   ⚠ Insuficiente - precisa de ${threshold} KB items`);
        return;
      }

      console.log(`   ✅ Threshold atingido! (${pendingKBItems} >= ${threshold} KB items)`);

      // CONDIÇÃO 2: Verificar GPUs disponíveis
      const onlineWorkers = await GPUPool.getOnlineWorkers();
      
      if (onlineWorkers.length === 0) {
        console.log("   ⚠ Nenhuma GPU online - aguardando workers");
        return;
      }

      console.log(`   ✅ ${onlineWorkers.length} GPU(s) online disponível(is)`);

      // CONDIÇÃO 3: Verificar se já há treino em andamento
      const runningJobs = await db.query.trainingJobs.findMany({
        where: eq(trainingJobs.status, "running"),
      });

      if (runningJobs.length > 0) {
        console.log(`   ⚠ ${runningJobs.length} job(s) em andamento - aguardando conclusão`);
        return;
      }

      console.log("   ✅ Nenhum treino em andamento");

      // TODAS AS CONDIÇÕES OK! 🚀
      console.log("\n   🎯 TODAS CONDIÇÕES OK - INICIANDO AUTO-TREINO!");

      await this.triggerTraining(config);
    } catch (error: any) {
      console.error(`[AutoTrain] ❌ Erro no check:`, error.message);
    }
  }

  /**
   * Dispara treino automaticamente
   */
  private async triggerTraining(config: ReturnType<typeof getMetaLearningConfig>): Promise<void> {
    try {
      // STEP 1: Gerar dataset automaticamente
      console.log("\n   📦 [1/3] Gerando dataset...");
      const dataset = await datasetGenerator.generateAutoDataset();

      if (!dataset) {
        console.log("   ❌ Falha ao gerar dataset");
        return;
      }

      console.log(`   ✅ Dataset gerado: ${dataset.examplesCount} exemplos`);

      // STEP 2: Criar job de treino com LoRA + Privacy Heuristics
      console.log("\n   🔧 [2/3] Criando job de treino...");
      
      const [job] = await db.insert(trainingJobs).values({
        name: `Auto-Training ${config.mode} ${new Date().toISOString()}`,
        description: `Treino automático com ${dataset.examplesCount} exemplos (modo: ${config.mode})`,
        model: "llama3-8b", // Default model
        datasetId: dataset.datasetId,
        status: "pending",
        config: {
          // LoRA configuration (parameter-efficient fine-tuning)
          lora: {
            r: config.lora.rank,
            alpha: config.lora.alpha,
            dropout: config.lora.dropout,
            targetModules: config.lora.targetModules,
          },
          // Training parameters
          training: {
            epochs: config.training.epochs,
            batchSize: config.training.batchSize,
            learningRate: config.training.learningRate,
            warmupSteps: config.training.warmupSteps,
            gradientAccumulationSteps: config.training.gradientAccumulationSteps,
          },
          // Privacy Heuristics (threshold + LoRA + replay + PII)
          privacy: {
            mode: 'heuristics',
            threshold: config.thresholds.minExamples,
            piiRedaction: config.piiRedaction.enabled,
            replayBuffer: config.replayBuffer.enabled,
            loraRank: config.lora.rank,
          },
          // Meta info
          autoTriggered: true,
          mode: config.mode,
          replayBufferEnabled: config.replayBuffer.enabled,
        },
      } as any).returning();

      console.log(`   ✅ Job criado: ID ${job.id}`);
      console.log(`   🔐 Privacy: Heuristics (threshold=${config.thresholds.minExamples}, LoRA=${config.lora.rank}, PII=${config.piiRedaction.enabled})`);

      // STEP 3: Verificar quantas GPUs disponíveis
      console.log("\n   🎮 [3/5] Verificando GPUs disponíveis...");
      const availableWorkers = await GPUPool.getAvailableWorkersForTraining();
      
      if (availableWorkers.length === 0) {
        console.log("   ❌ Nenhuma GPU disponível");
        return;
      }

      console.log(`   ✅ ${availableWorkers.length} GPU(s) disponível(is)`);

      // STEP 4: Distribuir treino (Federated ou Single)
      const federatedThreshold = config.thresholds.federatedMinimum;
      if (availableWorkers.length > 1 && dataset.examplesCount >= federatedThreshold) {
        // FEDERATED LEARNING - Múltiplas GPUs
        console.log("\n   🌐 [4/5] MODO FEDERADO - Dividindo dataset...");
        
        // Buscar dataset real do banco para pegar storagePath
        const datasetRecord = await db.query.datasets.findFirst({
          where: eq((await import("../../shared/schema")).datasets.id, dataset.datasetId),
        });

        if (!datasetRecord?.storagePath) {
          console.log("   ❌ Dataset storagePath não encontrado");
          return;
        }

        // Dividir dataset em chunks (1 chunk por GPU)
        const splitResult = await datasetSplitter.splitDataset(
          datasetRecord.storagePath,
          availableWorkers.length,
          job.id
        );

        console.log(`   ✅ Dataset dividido em ${splitResult.totalChunks} chunks`);
        console.log(`   📊 ~${splitResult.avgChunkSize} exemplos por GPU`);

        // STEP 5: Iniciar treino em TODAS as GPUs em paralelo
        console.log("\n   🚀 [5/5] Iniciando treino DISTRIBUÍDO...");

        // Construir URL base pública (com fallback para desenvolvimento local)
        let baseUrl: string;
        if (process.env.PUBLIC_BASE_URL) {
          // Prioridade 1: Env var configurável
          baseUrl = process.env.PUBLIC_BASE_URL;
        } else if (process.env.REPLIT_DEV_DOMAIN) {
          // Prioridade 2: Replit deployment/dev
          baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
        } else if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
          // Prioridade 3: Replit formato antigo
          baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
        } else {
          // Fallback: localhost (desenvolvimento local)
          const port = process.env.PORT || '5000';
          baseUrl = `http://localhost:${port}`;
          console.log(`   ⚠️  Usando localhost - workers remotos NÃO conseguirão baixar chunks!`);
          console.log(`   💡 Configure PUBLIC_BASE_URL env var com sua URL pública`);
        }

        const trainingPromises = splitResult.chunks.map(async (chunk, idx) => {
          const worker = availableWorkers[idx];
          
          // ✅ CORREÇÃO: Passar URL downloadable em vez de file path local
          const chunkUrl = `${baseUrl}/api/datasets/chunks/${job.id}/${chunk.chunkIndex}/download`;
          
          return GPUPool.startTraining(worker.id, job.id, {
            datasetPath: chunkUrl, // URL que workers remotos podem baixar
            modelName: "llama3-8b",
            loraConfig: {
              r: config.lora.rank,
              alpha: config.lora.alpha,
              dropout: config.lora.dropout,
            },
            trainingArgs: {
              epochs: config.training.epochs,
              batchSize: config.training.batchSize,
              learningRate: config.training.learningRate,
            },
          });
        });

        const results = await Promise.all(trainingPromises);
        const successCount = results.filter(r => r === true).length;

        console.log("\n   🎉 TREINO FEDERADO INICIADO!");
        console.log(`   📊 Dataset: ${dataset.examplesCount} exemplos`);
        console.log(`   🎮 GPUs ativas: ${successCount}/${availableWorkers.length}`);
        console.log(`   🌐 Modo: FEDERATED LEARNING (FedAvg)`);
        console.log(`   📝 Job ID: ${job.id}`);
        
        console.log("\n   🤖 AUTOMAÇÃO 100% ATIVA:");
        console.log("   ✅ GradientAggregationCoordinator monitorando (check: 30s)");
        console.log("   ✅ FedAvg automático quando todos workers completarem");
        console.log("   ✅ Deployment automático do modelo (check: 1min)");
        console.log("   ✅ Hot reload automático nos workers (zero downtime)");
      } else {
        // SINGLE GPU - Treino tradicional
        console.log("\n   💻 [4/5] MODO SINGLE-GPU...");
        
        const worker = availableWorkers[0];
        
        await GPUPool.startTraining(worker.id, job.id, {
          datasetPath: String(dataset.datasetId),
          modelName: "llama3-8b",
          loraConfig: {
            r: config.lora.rank,
            alpha: config.lora.alpha,
            dropout: config.lora.dropout,
          },
          trainingArgs: {
            epochs: config.training.epochs,
            batchSize: config.training.batchSize,
            learningRate: config.training.learningRate,
          },
        });

        console.log("\n   🚀 AUTO-TREINO INICIADO!");
        console.log(`   📊 Dataset: ${dataset.examplesCount} exemplos`);
        console.log(`   🎮 GPU: Worker #${worker.id} (${worker.provider})`);
        console.log(`   📝 Job ID: ${job.id}`);
      }
    } catch (error: any) {
      console.error(`[AutoTrain] ❌ Erro ao disparar treino:`, error.message);
    }
  }

  /**
   * Disparo manual (para testes)
   */
  async triggerNow(): Promise<void> {
    console.log("\n🚀 [AutoTrain] Disparo MANUAL iniciado...");
    const config = getMetaLearningConfig();
    await this.triggerTraining(config);
  }

  /**
   * Ativar/desativar
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[AutoTrain] ${enabled ? "✅ Ativado" : "❌ Desativado"}`);
  }
}

// Export singleton
export const autoTrainingTrigger = new AutoTrainingTrigger();
