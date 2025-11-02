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
  private gradientTimeoutMs = 5 * 60 * 1000; // 5 minutos timeout para gradientes
  
  // Tracking de timeout por job
  private jobTimeouts = new Map<number, number>(); // jobId -> timestamp primeiro check

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
        
        // Limpar timeout tracking
        this.jobTimeouts.delete(jobId);
        
        await this.triggerAggregation(jobId, workers.length);
      } else if (allFailed) {
        console.log(`   ❌ Job ${jobId}: Todos workers falharam - marcando job como failed`);
        
        // Limpar timeout tracking
        this.jobTimeouts.delete(jobId);
        
        await db.update(trainingJobs)
          .set({ status: "failed" })
          .where(eq(trainingJobs.id, jobId));
      } else {
        // Ainda treinando - verificar timeout
        const completedCount = workers.filter(w => w.status === "completed").length;
        console.log(`   ⏳ Job ${jobId}: ${completedCount}/${workers.length} workers completaram`);
        
        // Verificar se há workers travados há muito tempo
        await this.checkWorkersTimeout(jobId, workers);
      }
    } catch (error: any) {
      console.error(`[GradAgg] Erro ao verificar job ${jobId}:`, error);
    }
  }

  /**
   * Verifica timeout de workers e falha workers travados
   */
  private async checkWorkersTimeout(jobId: number, workers: any[]) {
    try {
      const now = Date.now();
      
      // Workers que ainda estão training mas não completaram
      const trainingWorkers = workers.filter(w => w.status === "training");
      
      if (trainingWorkers.length === 0) return;
      
      // Verificar se job está esperando há muito tempo
      if (!this.jobTimeouts.has(jobId)) {
        // Primeira vez vendo workers training - iniciar timer
        this.jobTimeouts.set(jobId, now);
        return;
      }
      
      const firstCheckTime = this.jobTimeouts.get(jobId)!;
      const elapsedMs = now - firstCheckTime;
      
      if (elapsedMs > this.gradientTimeoutMs) {
        console.log(`\n⚠️  [TIMEOUT] Job ${jobId} esperando gradientes há ${Math.round(elapsedMs/1000)}s`);
        console.log(`   ⏱️  Limite: ${this.gradientTimeoutMs/1000}s`);
        console.log(`   📊 Workers travados: ${trainingWorkers.length}`);
        
        // Falhar workers que não completaram
        for (const worker of trainingWorkers) {
          console.log(`   ❌ Falhando worker ${worker.id} por timeout`);
          
          await db.update(trainingWorkers)
            .set({ 
              status: "failed",
              errorMessage: `Timeout: Não enviou gradientes em ${this.gradientTimeoutMs/1000}s`,
            })
            .where(eq(trainingWorkers.id, worker.id));
        }
        
        // Verificar se ainda há workers suficientes
        const remainingWorkers = workers.filter(w => w.status === "completed");
        const minWorkers = 1; // Mínimo 1 worker para continuar
        
        if (remainingWorkers.length >= minWorkers) {
          console.log(`   ✅ ${remainingWorkers.length} workers OK - continuando com parcial`);
          // Disparar agregação com workers que completaram
          this.jobTimeouts.delete(jobId);
          await this.triggerAggregation(jobId, remainingWorkers.length);
        } else {
          console.log(`   ❌ Insuficiente workers (${remainingWorkers.length}) - falhando job`);
          
          this.jobTimeouts.delete(jobId);
          
          await db.update(trainingJobs)
            .set({ 
              status: "failed",
              completedAt: new Date(),
            })
            .where(eq(trainingJobs.id, jobId));
        }
      }
    } catch (error: any) {
      console.error(`[GradAgg] Erro ao verificar timeout:`, error);
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
        
        // 1. Broadcast checkpoint para workers
        console.log(`\n📢 Broadcasting checkpoint para workers...`);
        const broadcastResult = await GPUPool.broadcastCheckpoint(
          jobId,
          aggregationResult.checkpointPath,
          currentStep + 1
        );
        
        console.log(`   ✅ Broadcast completo: ${broadcastResult.notified} workers notificados`);
        
        // 2. Resetar workers para assigned (prontos para re-dispatch)
        await db.update(trainingWorkers)
          .set({ 
            status: "assigned",
            currentStep: 0,
            localLoss: null,
          })
          .where(eq(trainingWorkers.jobId, jobId));
        
        console.log(`   ✅ Workers resetados para rodada ${currentStep + 1}`);
        
        // 3. Re-dispatch workers com checkpoint atualizado
        console.log(`\n🔄 Re-dispatching workers...`);
        const redispatchCount = await GPUPool.redispatchFederatedWorkers(
          jobId,
          aggregationResult.checkpointPath
        );
        
        console.log(`   ✅ ${redispatchCount} workers re-dispatched com checkpoint atualizado`);
        
        // Resetar timeout tracking para próxima rodada
        this.jobTimeouts.delete(jobId);
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
