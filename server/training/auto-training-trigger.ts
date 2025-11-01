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
  private minExamplesThreshold = 100; // Mínimo de exemplos para disparar treino
  private checkIntervalMs = 30 * 60 * 1000; // 30 minutos
  private intervalId: NodeJS.Timeout | null = null;
  private enabled = true;

  private defaultConfig: TrainingConfig = {
    model: "llama3-8b",
    lora: {
      r: 8,
      alpha: 16,
      dropout: 0.05,
    },
    training: {
      epochs: 3,
      batchSize: 4,
      learningRate: 2e-4,
    },
  };

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
   */
  private async checkAndTrigger(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    console.log("\n🤖 [AutoTrain] Verificando condições para auto-treino...");

    try {
      // CONDIÇÃO 1: Verificar exemplos pendentes
      const pendingExamples = await datasetGenerator.checkPendingExamples();
      console.log(`   📊 Exemplos pendentes: ${pendingExamples}`);

      if (pendingExamples < this.minExamplesThreshold) {
        console.log(`   ⚠ Insuficiente - precisa de ${this.minExamplesThreshold} exemplos`);
        return;
      }

      console.log(`   ✅ Threshold atingido! (${pendingExamples} >= ${this.minExamplesThreshold})`);

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

      await this.triggerTraining();
    } catch (error: any) {
      console.error(`[AutoTrain] ❌ Erro no check:`, error.message);
    }
  }

  /**
   * Dispara treino automaticamente
   */
  private async triggerTraining(): Promise<void> {
    try {
      // STEP 1: Gerar dataset automaticamente
      console.log("\n   📦 [1/3] Gerando dataset...");
      const dataset = await datasetGenerator.generateAutoDataset();

      if (!dataset) {
        console.log("   ❌ Falha ao gerar dataset");
        return;
      }

      console.log(`   ✅ Dataset gerado: ${dataset.examplesCount} exemplos`);

      // STEP 2: Criar job de treino
      console.log("\n   🔧 [2/3] Criando job de treino...");
      
      const [job] = await db.insert(trainingJobs).values({
        name: `Auto-Training ${new Date().toISOString()}`,
        description: `Treino automático com ${dataset.examplesCount} exemplos`,
        model: this.defaultConfig.model,
        datasetId: dataset.datasetId,
        status: "pending",
        config: {
          ...this.defaultConfig,
          autoTriggered: true,
        },
      } as any).returning();

      console.log(`   ✅ Job criado: ID ${job.id}`);

      // STEP 3: Distribuir para GPU disponível
      console.log("\n   🎮 [3/3] Distribuindo para GPU...");
      
      const worker = await GPUPool.selectWorkerForTraining();
      
      if (!worker) {
        console.log("   ❌ Nenhuma GPU disponível agora");
        return;
      }

      console.log(`   ✅ GPU selecionada: Worker #${worker.id} (${worker.provider})`);

      // Iniciar treino no worker
      await GPUPool.startTraining(worker.id, job.id, {
        datasetPath: String(dataset.datasetId), // Passar ID em vez de filepath
        modelName: this.defaultConfig.model,
        loraConfig: this.defaultConfig.lora,
        trainingArgs: this.defaultConfig.training,
      });

      console.log("\n   🚀 AUTO-TREINO INICIADO COM SUCESSO!");
      console.log(`   📊 Dataset: ${dataset.examplesCount} exemplos`);
      console.log(`   🎮 GPU: Worker #${worker.id}`);
      console.log(`   📝 Job ID: ${job.id}`);
    } catch (error: any) {
      console.error(`[AutoTrain] ❌ Erro ao disparar treino:`, error.message);
    }
  }

  /**
   * Disparo manual (para testes)
   */
  async triggerNow(): Promise<void> {
    console.log("\n🚀 [AutoTrain] Disparo MANUAL iniciado...");
    await this.triggerTraining();
  }

  /**
   * Configurar threshold
   */
  setThreshold(min: number): void {
    this.minExamplesThreshold = min;
    console.log(`[AutoTrain] Threshold atualizado: ${min} exemplos`);
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
