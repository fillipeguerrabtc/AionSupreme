/**
 * GPU POOL - Sistema de gerenciamento de GPUs com balanceamento de carga
 * 
 * Prioridades:
 * 1. INFERÊNCIA (alta prioridade) - Resposta rápida ao usuário
 * 2. TREINO (baixa prioridade) - Background, usa GPUs ociosas
 * 
 * Balanceamento inteligente:
 * - Se há inferência → dedica 70% das GPUs para inferência
 * - Se não há inferência → 100% para treino
 */

import { db } from "../db";
import { gpuWorkers } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import axios from "axios";

interface GPUWorker {
  id: number;
  provider: string;
  status: string;
  ngrokUrl: string;
  capabilities: {
    tor_enabled: boolean;
    model: string;
    gpu: string;
    vram_gb?: number;
    max_concurrent?: number;
  };
  currentLoad: number; // 0-100%
  quotaRemaining: number;
}

interface InferenceRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

interface InferenceResponse {
  response: string;
  workerId: number;
  latencyMs: number;
  model: string;
}

interface TrainingRequest {
  datasetPath: string;
  modelName: string;
  loraConfig: {
    r: number;
    alpha: number;
    dropout: number;
  };
  trainingArgs: {
    epochs: number;
    batchSize: number;
    learningRate: number;
  };
}

export class GPUPool {
  /**
   * Obtém workers online disponíveis
   */
  static async getOnlineWorkers(): Promise<GPUWorker[]> {
    try {
      const workers = await db.query.gpuWorkers.findMany({
        where: eq(gpuWorkers.status, "online"),
      });

      return workers.map(w => ({
        id: w.id,
        provider: w.provider,
        status: w.status,
        ngrokUrl: w.ngrokUrl,
        capabilities: w.capabilities,
        currentLoad: 0, // TODO: implementar tracking de load
        quotaRemaining: 100, // TODO: implementar quota tracking
      }));
    } catch (error) {
      console.error("[GPUPool] Erro ao buscar workers:", error);
      return [];
    }
  }

  /**
   * INFERÊNCIA COM GPU (PRIORIDADE MÁXIMA)
   * 
   * COMPORTAMENTO:
   * - Se GPU estiver treinando → PAUSA TREINO IMEDIATAMENTE
   * - Responde usuário (2-5s)
   * - Retoma treino automaticamente
   * 
   * GPU NÃO divide poder! Ela alterna entre tarefas com preempção.
   */
  static async inference(request: InferenceRequest): Promise<InferenceResponse | null> {
    try {
      console.log("\n🚨 [GPUPool] INFERÊNCIA - PRIORIDADE MÁXIMA");

      // Buscar worker disponível
      const workers = await this.getOnlineWorkers();
      
      if (workers.length === 0) {
        console.log("   ⚠ Nenhuma GPU online");
        return null;
      }

      // Selecionar qualquer worker (prioriza menos carregado)
      const selectedWorker = workers.reduce((prev, curr) => 
        prev.currentLoad < curr.currentLoad ? prev : curr
      );

      console.log(`   ✓ GPU selecionada: Worker #${selectedWorker.id} (${selectedWorker.provider})`);
      
      // Se GPU estiver treinando → pausar treino (handled pelo worker)
      if (selectedWorker.currentLoad > 50) {
        console.log("   🔄 GPU treinando → PAUSANDO TREINO para responder usuário");
      }

      // Fazer chamada de inferência
      const startTime = Date.now();
      
      const response = await axios.post(
        `${selectedWorker.ngrokUrl}/v1/chat/completions`,
        {
          messages: request.messages,
          temperature: request.temperature || 0.7,
          max_tokens: request.maxTokens || 1024,
        },
        {
          timeout: 30000, // 30s timeout
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const latencyMs = Date.now() - startTime;

      const content = response.data.choices?.[0]?.message?.content || "";

      console.log(`   ✅ Inferência concluída em ${latencyMs}ms`);

      return {
        response: content,
        workerId: selectedWorker.id,
        latencyMs,
        model: "custom-lora",
      };
    } catch (error: any) {
      console.error(`[GPUPool] ❌ Erro na inferência:`, error.message);
      return null;
    }
  }

  /**
   * TREINO COM GPU (Baixa Prioridade)
   * Usa GPUs ociosas para treinar
   */
  static async startTraining(
    workerId: number,
    jobId: number,
    request: TrainingRequest
  ): Promise<boolean> {
    try {
      console.log(`\n🏋️ [GPUPool] Iniciando treino no Worker #${workerId}...`);

      // Buscar worker
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, workerId),
      });

      if (!worker || worker.status !== "online") {
        console.log("   ❌ Worker não disponível");
        return false;
      }

      // Construir URL pública do dataset (acessível por workers remotos)
      let baseUrl: string;
      
      if (process.env.REPLIT_DEV_DOMAIN) {
        // Ambiente Replit (development ou deployment)
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        // Fallback para formato antigo
        baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      } else {
        // ERRO: sem domínio público configurado
        throw new Error("Ambiente sem URL pública configurada. Workers remotos não conseguirão baixar datasets.");
      }
      
      // datasetPath agora é o dataset ID (string)
      const datasetUrl = `${baseUrl}/api/datasets/${request.datasetPath}/download`;
      
      console.log(`   📡 Dataset URL: ${datasetUrl}`);

      // Enviar job de treino
      const response = await axios.post(
        `${worker.ngrokUrl}/train`,
        {
          jobId,
          dataset: datasetUrl, // USAR URL EM VEZ DE PATH LOCAL
          model: request.modelName,
          lora: request.loraConfig,
          training: request.trainingArgs,
        },
        {
          timeout: 60000, // 1min timeout (treino é async)
        }
      );

      console.log(`   ✅ Treino iniciado: ${response.data.status}`);

      // Atualizar status no banco
      await db.update(gpuWorkers)
        .set({
          status: "training",
        })
        .where(eq(gpuWorkers.id, workerId));

      return true;
    } catch (error: any) {
      console.error(`[GPUPool] ❌ Erro ao iniciar treino:`, error.message);
      return false;
    }
  }

  /**
   * Seleciona worker para treino (apenas GPUs ociosas)
   */
  static async selectWorkerForTraining(): Promise<GPUWorker | null> {
    const workers = await this.getOnlineWorkers();
    
    // Filtrar apenas workers ociosos (load < 30%)
    const idleWorkers = workers.filter(w => w.currentLoad < 30);

    if (idleWorkers.length === 0) {
      return null;
    }

    // Selecionar worker com mais quota disponível
    return idleWorkers.reduce((prev, curr) =>
      prev.quotaRemaining > curr.quotaRemaining ? prev : curr
    );
  }

  /**
   * Balanceamento inteligente de carga
   * 
   * REGRA OURO (Sistema de PREEMPÇÃO):
   * - SEM usuários → 100% GPUs fazem TREINO contínuo
   * - COM usuários → GPU PAUSA treino, responde, RETOMA treino
   * 
   * GPU NÃO divide poder simultaneamente!
   * Ela alterna: Inferência (prioridade) > Treino (background)
   * 
   * Exemplo com 1 GPU:
   * 1. GPU treinando (100% capacidade)
   * 2. Usuário pergunta → PAUSA treino
   * 3. Responde em 2-5s
   * 4. RETOMA treino automaticamente
   */
  static async getAvailableWorkersForTraining(): Promise<GPUWorker[]> {
    const allWorkers = await this.getOnlineWorkers();
    
    // TODAS as GPUs podem treinar quando ociosas
    // O worker interno vai pausar treino se chegar inferência
    
    console.log(`\n🎮 [GPUPool] Balanceamento Inteligente:`);
    console.log(`   📊 Total GPUs online: ${allWorkers.length}`);
    console.log(`   🔥 Disponíveis para TREINO: ${allWorkers.length}`);
    console.log(`   ⚡ Sistema de PREEMPÇÃO ativo`);
    console.log(`   → Inferência pausa treino automaticamente`);

    return allWorkers; // TODAS podem treinar (com preempção)
  }

  /**
   * Distribuir treino entre TODAS as GPUs
   * 
   * NOTA: Treino roda com PREEMPÇÃO
   * - Se chegar inferência → worker PAUSA treino
   * - Responde usuário
   * - RETOMA treino automaticamente
   */
  static async distributeTraining(jobId: number, request: TrainingRequest): Promise<number> {
    const availableWorkers = await this.getAvailableWorkersForTraining();

    if (availableWorkers.length === 0) {
      console.log("   ⚠ Nenhuma GPU online");
      return 0;
    }

    console.log(`\n🚀 [GPUPool] Iniciando TREINO DISTRIBUÍDO:`);
    console.log(`   🎮 GPUs: ${availableWorkers.length}`);
    console.log(`   ⚡ Modo: PREEMPÇÃO (pausa se chegar inferência)`);

    let started = 0;

    // Iniciar treino em TODAS as GPUs
    for (const worker of availableWorkers) {
      const success = await this.startTraining(worker.id, jobId, request);
      if (success) started++;
    }

    console.log(`   ✅ Treino ativo em ${started}/${availableWorkers.length} GPU(s)`);
    console.log(`   💡 Workers vão pausar automaticamente se houver inferência`);
    
    return started;
  }

  /**
   * FEDERATED LEARNING - Dispatch chunk específico para worker
   * Usado em multi-round training
   */
  static async dispatchFederatedChunk(
    workerId: number,
    jobId: number,
    chunkIndex: number,
    checkpointUrl?: string
  ): Promise<boolean> {
    try {
      console.log(`\n🔄 [GPUPool] Dispatching chunk ${chunkIndex} para Worker #${workerId}...`);

      // Buscar worker
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, workerId),
      });

      if (!worker || worker.status !== "online") {
        console.log("   ❌ Worker não disponível");
        return false;
      }

      // Construir URL pública base
      let baseUrl: string;
      
      if (process.env.PUBLIC_BASE_URL) {
        baseUrl = process.env.PUBLIC_BASE_URL;
      } else if (process.env.REPLIT_DEV_DOMAIN) {
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      } else {
        baseUrl = "http://localhost:5000";
      }

      // URLs para chunk e checkpoint
      const chunkUrl = `${baseUrl}/api/datasets/chunks/${jobId}/${chunkIndex}/download`;
      const checkpointDownloadUrl = checkpointUrl || `${baseUrl}/api/training/jobs/${jobId}/checkpoint`;

      console.log(`   📦 Chunk URL: ${chunkUrl}`);
      if (checkpointUrl) {
        console.log(`   📁 Checkpoint URL: ${checkpointDownloadUrl}`);
      }

      // Enviar task federada
      const response = await axios.post(
        `${worker.ngrokUrl}/federated/train`,
        {
          jobId,
          chunkIndex,
          chunkUrl,
          checkpointUrl: checkpointDownloadUrl,
          callbackUrl: `${baseUrl}/api/training/gradients/submit`,
        },
        {
          timeout: 60000, // 1min timeout
        }
      );

      console.log(`   ✅ Chunk dispatched: ${response.data.status}`);

      // Atualizar worker no banco
      await db.update(gpuWorkers)
        .set({ status: "training" })
        .where(eq(gpuWorkers.id, workerId));

      return true;
    } catch (error: any) {
      console.error(`[GPUPool] ❌ Erro ao dispatch chunk:`, error.message);
      return false;
    }
  }

  /**
   * CHECKPOINT BROADCAST - Notifica todos workers sobre novo checkpoint
   * Workers baixam automaticamente e iniciam próxima rodada
   */
  static async broadcastCheckpoint(
    jobId: number,
    checkpointPath: string,
    round: number
  ): Promise<{ notified: number; failed: number }> {
    try {
      console.log(`\n📢 [GPUPool] Broadcasting checkpoint - Rodada ${round}`);
      console.log(`   📁 Checkpoint: ${checkpointPath}`);

      // Buscar workers ONLINE (não apenas trainers)
      const workers = await this.getOnlineWorkers();

      if (workers.length === 0) {
        console.log("   ⚠️  Nenhuma GPU online para broadcast");
        return { notified: 0, failed: 0 };
      }

      // Construir URL pública
      let baseUrl: string;
      
      if (process.env.PUBLIC_BASE_URL) {
        baseUrl = process.env.PUBLIC_BASE_URL;
      } else if (process.env.REPLIT_DEV_DOMAIN) {
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      } else {
        baseUrl = "http://localhost:5000";
      }

      const checkpointUrl = `${baseUrl}/api/training/jobs/${jobId}/checkpoint`;

      let notified = 0;
      let failed = 0;

      // Notificar cada worker
      for (const worker of workers) {
        try {
          await axios.post(
            `${worker.ngrokUrl}/federated/checkpoint`,
            {
              jobId,
              round,
              checkpointUrl,
              action: "download_and_prepare",
            },
            {
              timeout: 30000, // 30s timeout
            }
          );
          
          notified++;
          console.log(`   ✅ Worker #${worker.id} notificado`);
        } catch (error: any) {
          failed++;
          console.error(`   ❌ Worker #${worker.id} falhou: ${error.message}`);
        }
      }

      console.log(`\n📊 Broadcast completo:`);
      console.log(`   ✅ Notificados: ${notified}`);
      console.log(`   ❌ Falhas: ${failed}`);

      return { notified, failed };
    } catch (error: any) {
      console.error(`[GPUPool] ❌ Erro no broadcast:`, error.message);
      return { notified: 0, failed: 0 };
    }
  }

  /**
   * Re-dispatch workers para próxima rodada federada
   * Após FedAvg, workers precisam recomeçar com checkpoint atualizado
   */
  static async redispatchFederatedWorkers(
    jobId: number,
    checkpointUrl: string
  ): Promise<number> {
    try {
      console.log(`\n🔄 [GPUPool] Re-dispatching workers para próxima rodada...`);
      
      // Buscar workers assigned para este job
      const { trainingWorkers } = await import("../../shared/schema");
      const { and } = await import("drizzle-orm");

      const assignedWorkers = await db.query.trainingWorkers.findMany({
        where: and(
          eq(trainingWorkers.jobId, jobId),
          eq(trainingWorkers.status, "assigned")
        ),
      });

      if (assignedWorkers.length === 0) {
        console.log("   ⚠️  Nenhum worker assigned para re-dispatch");
        return 0;
      }

      console.log(`   📊 Workers para re-dispatch: ${assignedWorkers.length}`);

      let dispatched = 0;

      for (const worker of assignedWorkers) {
        const success = await this.dispatchFederatedChunk(
          worker.workerId,
          jobId,
          worker.assignedChunk,
          checkpointUrl
        );

        if (success) {
          dispatched++;
          
          // Atualizar status para training
          await db.update(trainingWorkers)
            .set({ 
              status: "training",
              startedAt: new Date(),
            })
            .where(eq(trainingWorkers.id, worker.id));
        }
      }

      console.log(`   ✅ ${dispatched}/${assignedWorkers.length} workers re-dispatched`);

      return dispatched;
    } catch (error: any) {
      console.error(`[GPUPool] ❌ Erro ao re-dispatch:`, error.message);
      return 0;
    }
  }
}
