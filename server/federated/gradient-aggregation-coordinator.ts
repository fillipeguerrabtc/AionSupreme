/**
 * GRADIENT AGGREGATION COORDINATOR
 * 
 * Monitora workers de treino federado e coordena agregação de gradientes (FedAvg).
 * 
 * FLUXO:
 * 1. Monitor: Polling de jobs ativos a cada 30s
 * 2. Detecta quando TODOS workers de um job completaram
 * 3. Dispara GradientAggregator.aggregate(jobId, step)
 * 4. Atualiza modelo global com média dos gradientes
 * 5. Broadcast checkpoint para workers (próxima rodada)
 */

import { GPUPool } from "../gpu/pool";
import { gradientAggregator } from "./gradient-aggregator";
import { db } from "../db";
import { trainingJobs, trainingWorkers } from "../../shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

class GradientAggregationCoordinator {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMs = 30000; // 30 segundos

  /**
   * Inicia monitoramento de jobs ativos
   */
  start() {
    if (this.isRunning) {
      console.log("[GradAgg Coordinator] Já está rodando");
      return;
    }

    this.isRunning = true;
    console.log("[GradAgg Coordinator] ✅ Iniciado - verificando jobs a cada 30s");

    // Primeira verificação imediata
    this.checkActiveJobs();

    // Polling contínuo
    this.pollingInterval = setInterval(() => {
      this.checkActiveJobs();
    }, this.checkIntervalMs);
  }

  /**
   * Para monitoramento
   */
  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isRunning = false;
    console.log("[GradAgg Coordinator] ⏹️  Parado");
  }

  /**
   * Verifica todos jobs ativos e dispara agregação se necessário
   */
  private async checkActiveJobs() {
    try {
      // Buscar jobs RUNNING que usam federated learning
      const activeJobs = await db.query.trainingJobs.findMany({
        where: eq(trainingJobs.status, "running"),
      });

      // Filtrar apenas federados (que têm fedConfig)
      const federatedJobs = activeJobs.filter(job => 
        job.fedConfig && job.fedConfig.min_workers && job.fedConfig.min_workers > 1
      );

      if (federatedJobs.length === 0) {
        return; // Nenhum job federado ativo
      }

      console.log(`\n🔍 [GradAgg] Verificando ${federatedJobs.length} job(s) federado(s)...`);

      for (const job of federatedJobs) {
        await this.checkJobCompletion(job.id);
      }
    } catch (error: any) {
      console.error("[GradAgg Coordinator] Erro ao verificar jobs:", error);
    }
  }

  /**
   * Verifica se todos workers de um job completaram
   */
  private async checkJobCompletion(jobId: number) {
    try {
      // Buscar todos workers deste job (via tabela de associação)
      const workers = await db.query.trainingWorkers.findMany({
        where: eq(trainingWorkers.jobId, jobId),
      });

      if (workers.length === 0) {
        console.log(`   ⚠️  Job ${jobId}: Nenhum worker encontrado`);
        return;
      }

      // Verificar se TODOS completaram
      const allCompleted = workers.every(w => w.status === "completed");
      const allFailed = workers.every(w => w.status === "failed");

      if (allCompleted) {
        console.log(`   ✅ Job ${jobId}: Todos ${workers.length} workers completaram!`);
        await this.triggerAggregation(jobId, workers.length);
      } else if (allFailed) {
        console.log(`   ❌ Job ${jobId}: Todos workers falharam - marcando job como failed`);
        await db.update(trainingJobs)
          .set({ status: "failed" })
          .where(eq(trainingJobs.id, jobId));
      } else {
        // Ainda treinando
        const completedCount = workers.filter(w => w.status === "completed").length;
        console.log(`   ⏳ Job ${jobId}: ${completedCount}/${workers.length} workers completaram`);
      }
    } catch (error: any) {
      console.error(`[GradAgg] Erro ao verificar job ${jobId}:`, error);
    }
  }

  /**
   * Dispara agregação de gradientes (FedAvg)
   * Suporta MULTI-ROUND training
   */
  private async triggerAggregation(jobId: number, numWorkers: number) {
    try {
      console.log(`\n🔄 [FEDAVG] Iniciando agregação de gradientes...`);
      console.log(`   📝 Job ID: ${jobId}`);
      console.log(`   🎮 Workers: ${numWorkers}`);

      // Buscar job para pegar currentStep e totalSteps
      const job = await db.query.trainingJobs.findFirst({
        where: eq(trainingJobs.id, jobId),
      });

      if (!job) {
        throw new Error(`Job ${jobId} não encontrado`);
      }

      const currentStep = job.currentStep || 1;
      const totalSteps = job.totalSteps;

      // Verificar se deve agregar
      const shouldAggregate = await gradientAggregator.shouldAggregate(jobId, currentStep);

      if (!shouldAggregate) {
        console.log(`   ⚠️  Gradientes insuficientes para agregação (step ${currentStep}/${totalSteps})`);
        console.log(`   📊 Esperando mais workers enviarem gradientes...`);
        console.log(`   🔄 Próxima verificação em 30s`);
        
        // TODO: Implementar timeout - se gradientes não chegarem em X minutos, falhar job
        // NÃO marcar como completed - continuar esperando
        return;
      }

      // EXECUTAR FEDAVG
      console.log(`   🧮 Calculando média dos gradientes (FedAvg) - step ${currentStep}/${totalSteps}...`);
      
      const aggregationResult = await gradientAggregator.aggregate(jobId, currentStep);

      console.log("   ✅ Agregação concluída com sucesso!");
      console.log(`   📊 Checkpoint global: ${aggregationResult.checkpointPath}`);
      console.log(`   📊 Loss global: ${aggregationResult.globalLoss}`);

      // Verificar se é a última rodada
      const isLastRound = currentStep >= totalSteps;

      if (isLastRound) {
        // ÚLTIMA RODADA - Finalizar job
        await db.update(trainingJobs)
          .set({ 
            status: "completed",
            completedAt: new Date(),
            latestCheckpoint: aggregationResult.checkpointPath,
            globalLoss: aggregationResult.globalLoss,
            currentStep: currentStep + 1,
          })
          .where(eq(trainingJobs.id, jobId));

        console.log("\n🎉 JOB FEDERADO FINALIZADO!");
        console.log(`   ✅ Modelo global atualizado com média de ${numWorkers} GPUs`);
        console.log(`   📁 Checkpoint final: ${aggregationResult.checkpointPath}`);
        console.log(`   📥 Workers podem baixar: GET /api/training/jobs/${jobId}/checkpoint`);
      } else {
        // RODADAS INTERMEDIÁRIAS - Continuar treino
        await db.update(trainingJobs)
          .set({ 
            status: "running", // Manter running para próximas rodadas
            latestCheckpoint: aggregationResult.checkpointPath,
            globalLoss: aggregationResult.globalLoss,
            currentStep: currentStep + 1,
          })
          .where(eq(trainingJobs.id, jobId));

        console.log(`\n🔄 RODADA ${currentStep} COMPLETA - Continuando treino...`);
        console.log(`   📁 Checkpoint intermediário: ${aggregationResult.checkpointPath}`);
        console.log(`   🔄 Próxima rodada: ${currentStep + 1}/${totalSteps}`);
        
        // TODO: Broadcast checkpoint para workers iniciarem próxima rodada
        console.log(`   ⚠️  TODO: Implementar broadcast de checkpoint para workers`);
        
        // Resetar workers para próxima rodada
        await db.update(trainingWorkers)
          .set({ status: "assigned" })
          .where(eq(trainingWorkers.jobId, jobId));
        
        console.log(`   ✅ Workers resetados para rodada ${currentStep + 1}`);
      }

    } catch (error: any) {
      console.error(`[GradAgg] Erro ao agregar job ${jobId}:`, error);
      console.error(`   Detalhes: ${error.message}`);
      
      // Marcar job como failed
      await db.update(trainingJobs)
        .set({ status: "failed" })
        .where(eq(trainingJobs.id, jobId));
    }
  }
}

// Singleton
export const gradientAggregationCoordinator = new GradientAggregationCoordinator();
