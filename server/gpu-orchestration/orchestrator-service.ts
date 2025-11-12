/**
 * GPU ORCHESTRATOR SERVICE - MAESTRO
 * ===================================
 * 
 * Coordena TUDO:
 * - Intelligent Quota Manager (decide qual GPU usar)
 * - Colab Orchestrator (automation via Puppeteer)
 * - Kaggle Orchestrator (automation via Puppeteer)
 * - Auto-scheduler (roda periodicamente para rotação)
 * 
 * Features:
 * - Start GPU automaticamente (escolhe melhor disponível)
 * - Stop GPU antes dos limites (safety margins)
 * - Rotação inteligente quando quota acaba
 * - Health checks constantes
 * - Auto-register GPUs no backend
 * - 🔥 ENTERPRISE KEEP-ALIVE BUFFER (serverless pattern 2025):
 *   - GPUs mantidas ativas por 10min após completar tarefa
 *   - Timer renovável: nova tarefa = reset de 10min
 *   - Reduz latência: cold start ~3min → warm start <5s
 *   - Economiza quota: shutdown automático após idle
 *   - Estratégia AWS Lambda / Cloud Run / Kubernetes HPA
 */

import { quotaManager } from './intelligent-quota-manager';
import { colabOrchestrator } from './colab-orchestrator';
import { kaggleOrchestrator } from './kaggle-orchestrator';
import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface OrchestratorConfig {
  autoStart?: boolean;  // Auto-start best GPU on init
  checkInterval?: number;  // Health check interval (ms)
  idleShutdownDelayMs?: number;  // Keep-alive buffer duration (default: 10min)
}

export class OrchestratorService {
  private isRunning: boolean = false;
  private checkInterval?: NodeJS.Timeout;
  private readonly DEFAULT_CHECK_INTERVAL = 5 * 60 * 1000;  // 5min
  
  // 🔥 ENTERPRISE KEEP-ALIVE BUFFER (2025 Serverless Pattern)
  // APENAS PARA KAGGLE (on-demand): Mantém GPU ativa 10min após completar tarefa
  // COLAB: Schedule 24/7 fixo, NÃO usa keep-alive
  // Maps workerId → idle shutdown timer
  private idleShutdownTimers: Map<number, NodeJS.Timeout> = new Map();
  private readonly DEFAULT_IDLE_SHUTDOWN_DELAY_MS = 10 * 60 * 1000;  // 10min
  private idleShutdownDelayMs: number = this.DEFAULT_IDLE_SHUTDOWN_DELAY_MS;
  
  /**
   * Initialize orchestrator
   */
  async initialize(config: OrchestratorConfig = {}): Promise<void> {
    console.log('[Orchestrator] Initializing GPU Auto-Orchestration Service...');
    
    this.isRunning = true;
    
    // Configure keep-alive buffer duration
    this.idleShutdownDelayMs = config.idleShutdownDelayMs || this.DEFAULT_IDLE_SHUTDOWN_DELAY_MS;
    const idleMinutes = Math.round(this.idleShutdownDelayMs / 60000);
    console.log(`[Orchestrator] 🔥 Keep-alive buffer: ${idleMinutes}min (serverless pattern)`);
    
    // Start health check loop
    const interval = config.checkInterval || this.DEFAULT_CHECK_INTERVAL;
    this.checkInterval = setInterval(async () => {
      await this.healthCheckLoop();
    }, interval);
    
    console.log(`[Orchestrator] ✅ Initialized (health check every ${interval / 1000}s)`);
    
    // Auto-start best GPU if requested
    if (config.autoStart) {
      await this.startBestGPU();
    }
  }
  
  /**
   * Shutdown orchestrator
   */
  shutdown(): void {
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    // 🔥 ENTERPRISE: Clean up ALL keep-alive timers on shutdown
    this.cleanupAllIdleTimers();
    
    console.log('[Orchestrator] Shutdown complete');
  }
  
  /**
   * Start best available GPU (intelligent selection)
   */
  async startBestGPU(): Promise<{ success: boolean; workerId?: number; ngrokUrl?: string; reason?: string }> {
    try {
      console.log('[Orchestrator] Selecting best GPU to start...');
      
      // 1. Get best GPU from Quota Manager
      const selection = await quotaManager.selectBestGPU();
      
      if (!selection.gpu) {
        return { 
          success: false, 
          reason: selection.reason 
        };
      }
      
      const { gpu } = selection;
      console.log(`[Orchestrator] Selected ${gpu.provider} worker ${gpu.workerId} - ${selection.reason}`);
      
      // 2. Get worker config from database
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, gpu.workerId),
      });
      
      if (!worker) {
        return { success: false, reason: 'Worker not found in database' };
      }
      
      // 2B. GUARD: Verify worker is not already running (prevent duplicate startups)
      if (worker.sessionStartedAt !== null) {
        console.warn(`[Orchestrator] ⚠️  Worker ${gpu.workerId} already has active session - preventing duplicate startup`);
        return { 
          success: false, 
          reason: `Worker ${gpu.workerId} already has active session (started: ${worker.sessionStartedAt})` 
        };
      }
      
      // 3. Start session via appropriate orchestrator
      let result;
      
      if (gpu.provider === 'colab') {
        result = await colabOrchestrator.startSession({
          workerId: gpu.workerId,
          notebookUrl: worker.accountId || '',  // Store notebook URL in accountId
          googleEmail: process.env.COLAB_GOOGLE_EMAIL || '',
          googlePassword: process.env.COLAB_GOOGLE_PASSWORD || '',
          headless: true,
        });
      } else {  // kaggle
        // 🔥 NEW REQUIREMENT: BEFORE starting Kaggle, check if ANY GPU already online!
        const onlineCheck = await quotaManager.checkOnlineGPUs();
        
        if (onlineCheck.hasOnlineGPU) {
          console.log(`[Orchestrator] ⚠️  KAGGLE START ABORTED - GPU já online!`);
          console.log(`[Orchestrator] 📊 Online GPUs: ${onlineCheck.onlineCount} (${onlineCheck.providers.join(', ')})`);
          console.log(`[Orchestrator] 💡 Usando GPU existente ao invés de iniciar Kaggle (economiza quota!)`);
          
          return {
            success: false,
            reason: `Kaggle start aborted - ${onlineCheck.onlineCount} GPU(s) já online (${onlineCheck.providers.join(', ')}). Usando GPU existente para economizar quota.`
          };
        }
        
        console.log(`[Orchestrator] ✅ Nenhuma GPU online - OK para iniciar Kaggle #${gpu.workerId}`);
        
        const isGPU = !!(worker.capabilities?.gpu && worker.capabilities.gpu !== 'CPU');
        
        result = await kaggleOrchestrator.startSession({
          workerId: gpu.workerId,
          notebookUrl: worker.accountId || '',
          kaggleUsername: process.env.KAGGLE_USERNAME || '',
          kagglePassword: process.env.KAGGLE_PASSWORD || '',
          useGPU: isGPU,
          headless: true,
        });
      }
      
      if (!result.success) {
        return { success: false, reason: result.error };
      }
      
      // 4. Start session tracking in Quota Manager
      await quotaManager.startSession(gpu.workerId);
      
      // 5. Auto-register GPU via internal API
      if (result.ngrokUrl) {
        await this.autoRegisterGPU(gpu.workerId, result.ngrokUrl);
      }
      
      console.log(`[Orchestrator] ✅ GPU ${gpu.workerId} started successfully`);
      
      return {
        success: true,
        workerId: gpu.workerId,
        ngrokUrl: result.ngrokUrl,
        reason: `${gpu.provider} GPU started - ${selection.reason}`,
      };
      
    } catch (error) {
      console.error('[Orchestrator] Error starting GPU:', error);
      return { success: false, reason: String(error) };
    }
  }
  
  /**
   * Stop specific GPU
   */
  async stopGPU(workerId: number): Promise<{ success: boolean; reason?: string }> {
    try {
      console.log(`[Orchestrator] Stopping GPU ${workerId}...`);
      
      // Get worker to determine provider
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, workerId),
      });
      
      if (!worker) {
        return { success: false, reason: 'Worker not found' };
      }
      
      // Stop via appropriate orchestrator
      let result;
      
      if (worker.provider === 'colab') {
        result = await colabOrchestrator.stopSession(workerId);
      } else {  // kaggle
        result = await kaggleOrchestrator.stopSession(workerId);
      }
      
      if (!result.success) {
        return { success: false, reason: result.error };
      }
      
      // Stop session tracking
      await quotaManager.stopSession(workerId);
      
      console.log(`[Orchestrator] ✅ GPU ${workerId} stopped`);
      
      return { success: true, reason: `${worker.provider} GPU stopped` };
      
    } catch (error) {
      console.error(`[Orchestrator] Error stopping GPU ${workerId}:`, error);
      return { success: false, reason: String(error) };
    }
  }
  
  /**
   * Health check loop (runs every N minutes)
   * 
   * Checks:
   * 1. Update runtime for all active sessions
   * 2. Stop GPUs that reached safety limits
   * 3. Start new GPU if none are running
   */
  private async healthCheckLoop(): Promise<void> {
    if (!this.isRunning) return;
    
    try {
      console.log('[Orchestrator] Running health check...');
      
      // 1. Update runtimes
      const statuses = await quotaManager.getAllQuotaStatuses();
      
      for (const status of statuses) {
        if (status.sessionRuntimeSeconds > 0) {
          await quotaManager.updateSessionRuntime(status.workerId);
        }
      }
      
      // 2. Check for GPUs that need to stop
      const gpusToStop = await quotaManager.getGPUsToStop();
      
      for (const gpu of gpusToStop) {
        console.log(`[Orchestrator] ⚠️  GPU ${gpu.workerId} reached limit - stopping...`);
        await this.stopGPU(gpu.workerId);
      }
      
      // 3. If GPUs were stopped, try to start a new one
      if (gpusToStop.length > 0) {
        console.log('[Orchestrator] Attempting to start replacement GPU...');
        await this.startBestGPU();
      }
      
      // 4. Check if NO GPUs are running - start one
      const activeGPUs = statuses.filter(s => s.sessionRuntimeSeconds > 0);
      
      if (activeGPUs.length === 0) {
        console.log('[Orchestrator] No active GPUs - starting one...');
        await this.startBestGPU();
      }
      
      console.log(`[Orchestrator] ✅ Health check complete (${activeGPUs.length} GPUs active)`);
      
    } catch (error) {
      console.error('[Orchestrator] Health check error:', error);
    }
  }
  
  /**
   * Auto-register GPU in backend after successful start
   */
  private async autoRegisterGPU(workerId: number, ngrokUrl: string): Promise<void> {
    try {
      // Update worker with ngrok URL (already done in orchestrators, but ensure it's set)
      await db.update(gpuWorkers)
        .set({
          ngrokUrl: ngrokUrl,
          status: 'healthy',
        })
        .where(eq(gpuWorkers.id, workerId));
      
      console.log(`[Orchestrator] GPU ${workerId} registered with URL: ${ngrokUrl}`);
      
    } catch (error) {
      console.error('[Orchestrator] Auto-register error:', error);
    }
  }
  
  /**
   * Get orchestrator status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    activeGPUs: number;
    quotaStatuses: any[];
  }> {
    const statuses = await quotaManager.getAllQuotaStatuses();
    const activeGPUs = statuses.filter(s => s.sessionRuntimeSeconds > 0).length;
    
    return {
      isRunning: this.isRunning,
      activeGPUs,
      quotaStatuses: statuses,
    };
  }
  
  /**
   * 🔥 ENTERPRISE KEEP-ALIVE BUFFER - Schedule idle shutdown (APENAS KAGGLE)
   * 
   * Agenda shutdown automático após período idle (default: 10min)
   * Timer é renovável: nova tarefa = reset
   * 
   * REGRAS:
   * - APENAS Kaggle (on-demand): Liga → usa → keep-alive 10min → desliga
   * - Colab: Schedule 24/7 fixo, NÃO usa keep-alive
   * - Respeita quota 70%: KAGGLE_GPU_SAFETY = 8.4h, Weekly = 21h
   * 
   * PADRÃO 2025: AWS Lambda, Cloud Run, Kubernetes HPA
   */
  async scheduleKaggleIdleShutdown(workerId: number): Promise<void> {
    try {
      // 1. Verificar se é Kaggle (APENAS Kaggle usa keep-alive)
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, workerId),
      });
      
      if (!worker || worker.provider !== 'kaggle') {
        console.log(`[Orchestrator] ⚠️  Worker ${workerId} is not Kaggle - skip keep-alive`);
        return;
      }
      
      // 2. Cancelar timer existente (se houver)
      this.cancelKaggleIdleShutdown(workerId);
      
      const idleMinutes = Math.round(this.idleShutdownDelayMs / 60000);
      console.log(`[Orchestrator] 🕐 Kaggle GPU ${workerId} keep-alive: ${idleMinutes}min buffer started`);
      
      // 3. Agendar shutdown
      const timer = setTimeout(async () => {
        console.log(`[Orchestrator] ⏰ Kaggle GPU ${workerId} idle timeout (${idleMinutes}min) - shutting down to save quota`);
        await this.stopGPU(workerId);
        this.idleShutdownTimers.delete(workerId);
      }, this.idleShutdownDelayMs);
      
      this.idleShutdownTimers.set(workerId, timer);
      
    } catch (error) {
      console.error(`[Orchestrator] Error scheduling Kaggle idle shutdown:`, error);
    }
  }
  
  /**
   * 🔥 Cancel Kaggle idle shutdown (reset timer)
   * 
   * Chamado quando nova tarefa chega durante período de keep-alive
   * Timer é renovado após completar a nova tarefa
   */
  cancelKaggleIdleShutdown(workerId: number): void {
    const timer = this.idleShutdownTimers.get(workerId);
    if (timer) {
      clearTimeout(timer);
      this.idleShutdownTimers.delete(workerId);
      console.log(`[Orchestrator] ♻️  Kaggle GPU ${workerId} keep-alive timer reset (new task arrived)`);
    }
  }
  
  /**
   * 🔥 Cleanup ALL idle timers (shutdown orchestrator)
   */
  private cleanupAllIdleTimers(): void {
    if (this.idleShutdownTimers.size > 0) {
      console.log(`[Orchestrator] 🧹 Cleaning up ${this.idleShutdownTimers.size} keep-alive timer(s)...`);
      
      const timers = Array.from(this.idleShutdownTimers.entries());
      for (const [workerId, timer] of timers) {
        clearTimeout(timer);
        console.log(`[Orchestrator]    - Cancelled timer for Kaggle GPU ${workerId}`);
      }
      
      this.idleShutdownTimers.clear();
    }
  }
  
  /**
   * 🔥 PUBLIC API: Notify task completion (triggers keep-alive for Kaggle)
   * 
   * Chamado por:
   * - GPU Pool após completar inferência
   * - Training Jobs após completar treino
   * 
   * Behavior:
   * - Kaggle: Inicia keep-alive 10min
   * - Colab: No-op (schedule 24/7 fixo)
   */
  async notifyTaskCompleted(workerId: number): Promise<void> {
    console.log(`[Orchestrator] 📢 Task completed on GPU ${workerId}`);
    await this.scheduleKaggleIdleShutdown(workerId);
  }
  
  /**
   * 🔥 PUBLIC API: Notify task started (cancels keep-alive for Kaggle)
   * 
   * Chamado por:
   * - GPU Pool antes de iniciar inferência
   * - Training Jobs antes de iniciar treino
   * 
   * Behavior:
   * - Kaggle: Cancela timer idle (GPU volta a trabalhar)
   * - Colab: No-op
   */
  async notifyTaskStarted(workerId: number): Promise<void> {
    console.log(`[Orchestrator] 📢 Task started on GPU ${workerId}`);
    this.cancelKaggleIdleShutdown(workerId);
  }
}

// Singleton instance
export const orchestratorService = new OrchestratorService();
