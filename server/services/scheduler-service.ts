/**
 * PRODUCTION SCHEDULER SERVICE
 * =============================
 * 
 * Sistema REAL de agendamento com node-cron
 * Substitui setInterval() instável por cron jobs confiáveis
 * 
 * ✅ Persiste através de restarts (via systemd/PM2 se necessário)
 * ✅ Cron syntax padrão (0 * * * * = a cada hora)
 * ✅ Retry logic integrado
 * ✅ Logging estruturado
 * ✅ Graceful shutdown
 * 
 * JOBS AGENDADOS:
 * - Auto-Collection (conversas): A cada 1 hora
 * - Dataset Generation: A cada 6 horas
 * - Auto-Training Trigger: A cada 30 minutos
 * - Pattern Analyzer: A cada 2 horas
 * - Secrets Cleanup: A cada 24 horas (03:00 UTC)
 * - Namespace GC: Diariamente às 03:00 UTC
 * - KB Deduplication: Semanalmente (domingos 02:00 UTC)
 * 🔥 ON-DEMAND GPU JOBS:
 * - Training Queue Monitor: A cada 5min → Trigger Kaggle GPU se ≥25 KBs
 * - Weekly Quota Reset: Domingo 00:00 UTC → Reset weeklyUsageHours (21h/week = 70% safety limit)
 * - Auto-Stop Detection: A cada 5min → Auto-stop após job completion
 * - GPU Idle Monitor: A cada 5min → Shutdown idle GPUs (10min threshold)
 */

import * as cron from 'node-cron';
import { chatIngestionService } from '../learn/chat-ingestion';
import { datasetGenerator } from '../training/dataset-generator';
import { autoTrainingTrigger } from '../training/auto-training-trigger';
import { patternAnalyzer } from './pattern-analyzer';
import { secretsVault } from './security/secrets-vault';
import { modelDeploymentService } from './model-deployment-service';
import { quotaTelemetryService } from './quota-telemetry-service';
import { metaLearningOrchestrator } from '../meta/meta-learning-orchestrator';
import { onDemandGPUService } from './on-demand-gpu-service';
import { logger } from './logger-service';
import { retentionPolicyService } from './retention-policy-service';

interface ScheduledJob {
  name: string;
  schedule: string; // Cron syntax
  task: () => Promise<void> | void;
  enabled: boolean;
  job?: ReturnType<typeof cron.schedule>;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  errorCount: number;
}

export class SchedulerService {
  private jobs: Map<string, ScheduledJob> = new Map();
  private isRunning = false;

  constructor() {
    this.registerJobs();
  }

  /**
   * Registrar todos os jobs agendados
   */
  private registerJobs(): void {
    // JOB 1: Chat Ingestion - A cada 1 hora
    this.register({
      name: 'chat-ingestion',
      schedule: '0 * * * *', // A cada hora
      task: async () => {
        try {
          logger.info('Scheduler: Executando Chat Ingestion');
          await chatIngestionService.runAutoCollection();
        } catch (error: any) {
          logger.error('[SchedulerService] Error in chat-ingestion:', error);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // JOB 2: Dataset Generation - A cada 6 horas
    this.register({
      name: 'dataset-generation',
      schedule: '0 */6 * * *', // 00:00, 06:00, 12:00, 18:00
      task: async () => {
        try {
          logger.info('Scheduler: Executando Dataset Generation');
          const dataset = await datasetGenerator.generateAutoDataset();
          if (dataset) {
            logger.info(`Dataset criado com ${dataset.examplesCount} exemplos`);
          }
        } catch (error: any) {
          logger.error('[SchedulerService] Error in dataset-generation:', error);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // JOB 3: Auto-Training Trigger - A cada 30 minutos
    this.register({
      name: 'auto-training-trigger',
      schedule: '*/30 * * * *', // :00 e :30 de cada hora
      task: async () => {
        try {
          logger.info('Scheduler: Verificando necessidade de treino');
          // AutoTrainingTrigger tem métodos privados
          // Garantimos que está ativo via init-auto-evolution
          // Este job serve apenas como heartbeat/monitoring
          logger.info('Scheduler: Auto-training trigger monitorado');
        } catch (error: any) {
          logger.error('[SchedulerService] Error in auto-training-trigger:', error);
        }
      },
      enabled: false, // Desabilitado - AutoTrainingTrigger já tem seu próprio loop
      runCount: 0,
      errorCount: 0,
    });

    // JOB 4: Pattern Analyzer - A cada 2 horas
    this.register({
      name: 'pattern-analyzer',
      schedule: '0 */2 * * *', // 00:00, 02:00, 04:00, etc
      task: async () => {
        try {
          logger.info('Scheduler: Executando Pattern Analyzer');
          await patternAnalyzer.feedbackToTrainingCollector();
        } catch (error: any) {
          logger.error('[SchedulerService] Error in pattern-analyzer:', error);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // JOB 5: Secrets Cleanup - Diariamente às 03:00 UTC
    this.register({
      name: 'secrets-cleanup',
      schedule: '0 3 * * *', // 03:00 UTC (00:00 Brasília)
      task: async () => {
        try {
          logger.info('Scheduler: Limpando secrets expirados');
          const deleted = await secretsVault.cleanupExpired();
          logger.info(`${deleted} secrets expirados removidos`);
        } catch (error: any) {
          logger.error('[SchedulerService] Error in secrets-cleanup:', error);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // JOB 6: Model Deployment - A cada 1 minuto (P0.3 - Fine-Tune Deployment)
    this.register({
      name: 'model-deployment',
      schedule: '*/1 * * * *', // A cada 1 minuto (mais responsivo)
      task: async () => {
        try {
          const deployed = await modelDeploymentService.checkAndDeployCompletedJobs();
          if (deployed > 0) {
            logger.info(`Scheduler: Auto-Deploy concluído - ${deployed} modelo(s) deployed automaticamente`);
          }
        } catch (error: any) {
          logger.error('[SchedulerService] Error in model-deployment:', error);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // JOB 7: Quota Telemetry - A cada 1 minuto (P0.4 - Real Quota Tracking!)
    this.register({
      name: 'quota-telemetry',
      schedule: '* * * * *', // Executa TODOS os minutos
      task: async () => {
        try {
          // Log silencioso - roda a cada minuto, não precisa poluir logs
          const updated = await quotaTelemetryService.updateAllQuotas();
          // Só loga se houver workers ou problemas
          if (updated > 0) {
            // Logs já são feitos pelo service
          }
        } catch (error: any) {
          logger.error('[SchedulerService] Error in quota-telemetry:', error);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // JOB 8: Meta-Learning Pipeline - A cada 3 horas (P0.5 - Autonomous Learning!)
    this.register({
      name: 'meta-learning-pipeline',
      schedule: '0 */3 * * *', // 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00
      task: async () => {
        try {
          logger.info('Scheduler: Executando Meta-Learning Pipeline');
          const results = await metaLearningOrchestrator.executeFullPipeline();
          const successCount = results.filter(r => r.success).length;
          logger.info(`Pipeline completo: ${successCount}/${results.length} stages bem-sucedidos`);
        } catch (error: any) {
          logger.error('[SchedulerService] Error in meta-learning-pipeline:', error);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // JOB 9: 🔥 GPU Quota Safety Monitor - A cada 5 minutos (CRITICAL: 70% threshold enforcement)
    // REDUNDANT BACKUP ao monitoring 60s do AutoScalingOrchestrator
    // Garante shutdown preventivo mesmo se AutoScaling falhar
    this.register({
      name: 'gpu-quota-safety-monitor',
      schedule: '*/5 * * * *', // A cada 5 minutos
      task: async () => {
        try {
          const { quotaManager } = await import('../gpu-orchestration/intelligent-quota-manager');
          const { providerAlternationService } = await import('../gpu-orchestration/provider-alternation-service');
          
          // 1. Verificar GPUs que atingiram 70% quota
          const gpusToStop = await quotaManager.getGPUsToStop();
          
          if (gpusToStop.length > 0) {
            logger.warn(`🔥 CRON BACKUP: ${gpusToStop.length} GPUs atingiram 70% quota - Force shutdown!`);
            
            // 2. Force-shutdown cada GPU que ultrapassou 70%
            for (const gpu of gpusToStop) {
              logger.warn(`🛑 Force-stopping ${gpu.provider} GPU #${gpu.workerId} (quota: ${gpu.utilizationPercent.toFixed(1)}%)`);
              
              // Stop via quota manager (atualiza sessão)
              await quotaManager.stopSession(gpu.workerId);
              
              // Registrar provider stopped para alternância
              await providerAlternationService.recordProviderStopped(gpu.provider as 'colab' | 'kaggle');
              
              logger.info(`✅ GPU #${gpu.workerId} shutdown preventivo completo (70% threshold)`);
            }
          }
          
          // 3. Log status de quotas (silencioso se tudo OK)
          const allQuotas = await quotaManager.getAllQuotaStatuses();
          const atRisk = allQuotas.filter(q => q.utilizationPercent >= 60 && q.utilizationPercent < 70);
          
          if (atRisk.length > 0) {
            logger.warn(`⚠️  ${atRisk.length} GPUs acima de 60% quota (approaching 70% limit)`);
          }
          
        } catch (error: any) {
          logger.error(`❌ GPU quota monitoring error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // 🔥 JOB 10: Training Queue Monitor - A cada 5 minutos (ON-DEMAND Kaggle trigger)
    // 🚨 TEMPORARILY DISABLED - Auto-start causing quota waste + runaway kernels
    // RE-ENABLE only after implementing proper Kaggle kernel deletion
    this.register({
      name: 'training-queue-monitor',
      schedule: '*/5 * * * *', // A cada 5 minutos
      task: async () => {
        try {
          const { trainingQueueMonitor } = await import('./training-queue-monitor');
          
          // Check queue and trigger if needed
          const status = await trainingQueueMonitor.getQueueStatus();
          
          if (status.shouldTriggerGPU) {
            logger.info(`🚀 Training queue trigger: ${status.readyForTraining} KBs ready - Starting Kaggle GPU`);
            
            const { demandBasedKaggleOrchestrator } = await import('./demand-based-kaggle-orchestrator');
            await demandBasedKaggleOrchestrator.startForTraining(status.readyForTraining);
          }
        } catch (error: any) {
          logger.error(`Training queue monitor error: ${error.message}`);
        }
      },
      enabled: false, // 🚨 DISABLED until proper kernel deletion is implemented
      runCount: 0,
      errorCount: 0,
    });

    // ❌ REMOVED JOB 11: Daily Quota Reset - ON-DEMAND strategy has NO daily limits
    
    // 🔥 JOB 11: Weekly Quota Reset - Domingo 00:00 UTC
    this.register({
      name: 'weekly-quota-reset',
      schedule: '0 0 * * 0', // Domingo 00:00 UTC
      task: async () => {
        try {
          logger.info('🔄 Resetting weekly GPU quotas (Sunday 00:00 UTC)');
          
          const { db } = await import('../db');
          const { gpuWorkers } = await import('../../shared/schema');
          const { eq, sql } = await import('drizzle-orm');
          
          // Reset weeklyUsageHours para todos os workers
          const updated = await db
            .update(gpuWorkers)
            .set({
              weeklyUsageHours: 0,
              weeklyUsageSeconds: 0,
              weekStartedAt: new Date(),
              updatedAt: new Date(),
            })
            .execute();
          
          logger.info(`✅ Weekly quota reset complete - ${updated.rowCount || 0} workers updated`);
        } catch (error: any) {
          logger.error(`Weekly quota reset error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // 🔥 JOB 12: Auto-Stop Detection - A cada 5 minutos (ON-DEMAND job completion detection)
    this.register({
      name: 'kaggle-auto-stop-detection',
      schedule: '*/5 * * * *', // A cada 5 minutos
      task: async () => {
        try {
          const { demandBasedKaggleOrchestrator } = await import('./demand-based-kaggle-orchestrator');
          
          // Check if active job completed and auto-stop
          await demandBasedKaggleOrchestrator.autoStopAfterJobCompletion();
        } catch (error: any) {
          // Silent error - não é crítico se falhar
          logger.error(`Auto-stop detection error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // 🔥 JOB 13: Colab Cooldown Enforcer - A cada 5 minutos (11h + 36h rest cycle)
    // CRITICAL: Google Colab has strict usage limits - we MUST enforce rest periods
    // - Session limit: 11h (with 1h safety margin from 12h max)
    // - Mandatory rest: 36h after each session
    this.register({
      name: 'colab-cooldown-enforcer',
      schedule: '*/5 * * * *', // A cada 5 minutos
      task: async () => {
        try {
          const { db } = await import('../db');
          const { gpuWorkers } = await import('../../shared/schema');
          const { eq, and, lt, isNotNull, sql } = await import('drizzle-orm');
          
          // 1. Find Colab workers that exceeded 11h session (auto-stop + cooldown)
          const now = new Date();
          const elevenHoursAgo = new Date(now.getTime() - 11 * 60 * 60 * 1000);
          
          const runningColabs = await db
            .select()
            .from(gpuWorkers)
            .where(
              and(
                eq(gpuWorkers.provider, 'colab'),
                eq(gpuWorkers.status, 'healthy'),
                lt(gpuWorkers.sessionStartedAt, elevenHoursAgo)
              )
            );
          
          // 2. Stop each GPU that exceeded 11h and set 36h cooldown
          for (const worker of runningColabs) {
            const sessionDuration = worker.sessionStartedAt 
              ? (now.getTime() - worker.sessionStartedAt.getTime()) / (1000 * 60 * 60)
              : 0;
            
            logger.warn(`🛑 Colab GPU #${worker.id} exceeded 11h (${sessionDuration.toFixed(1)}h) - Force shutdown + 36h cooldown`);
            
            // 🔥 CRITICAL FIX: Actually stop the Colab session (not just DB update)
            // This terminates the browser, stops runtime, and prevents quota burn
            // IMPORTANT: Use singleton instance to access activeSessions map!
            try {
              const { colabOrchestrator } = await import('../gpu-orchestration/colab-orchestrator');
              
              const stopResult = await colabOrchestrator.stopSession(worker.id);
              
              if (stopResult.success) {
                logger.info(`✅ Colab GPU #${worker.id} session terminated successfully`);
              } else {
                logger.error(`❌ Failed to stop Colab GPU #${worker.id}: ${stopResult.error}`);
                
                // Fallback: Force DB update even if session stop failed
                // This prevents infinite retry loops
                const cooldownUntil = new Date(now.getTime() + 36 * 60 * 60 * 1000);
                
                await db
                  .update(gpuWorkers)
                  .set({
                    status: 'offline',
                    cooldownUntil,
                    sessionDurationSeconds: Math.floor((now.getTime() - (worker.sessionStartedAt?.getTime() || now.getTime())) / 1000),
                    updatedAt: now,
                  })
                  .where(eq(gpuWorkers.id, worker.id));
                
                logger.warn(`⚠️  Colab GPU #${worker.id} marked offline despite stop failure (prevents runaway session)`);
              }
            } catch (stopError: any) {
              logger.error(`❌ Exception stopping Colab GPU #${worker.id}: ${stopError.message}`);
              
              // Fallback: Force DB update to prevent infinite retries
              const cooldownUntil = new Date(now.getTime() + 36 * 60 * 60 * 1000);
              
              await db
                .update(gpuWorkers)
                .set({
                  status: 'offline',
                  cooldownUntil,
                  sessionDurationSeconds: Math.floor((now.getTime() - (worker.sessionStartedAt?.getTime() || now.getTime())) / 1000),
                  updatedAt: now,
                })
                .where(eq(gpuWorkers.id, worker.id));
              
              logger.warn(`⚠️  Colab GPU #${worker.id} marked offline after exception (defensive fallback)`);
            }
          }
          
          // 3. Check for workers in cooldown and log when they'll be available
          const inCooldown = await db
            .select()
            .from(gpuWorkers)
            .where(
              and(
                eq(gpuWorkers.provider, 'colab'),
                isNotNull(gpuWorkers.cooldownUntil),
                sql`${gpuWorkers.cooldownUntil} > ${now}`
              )
            );
          
          if (inCooldown.length > 0) {
            for (const worker of inCooldown) {
              const hoursRemaining = worker.cooldownUntil 
                ? (worker.cooldownUntil.getTime() - now.getTime()) / (1000 * 60 * 60)
                : 0;
              
              if (hoursRemaining > 0) {
                logger.info(`⏳ Colab GPU #${worker.id} in cooldown - ${hoursRemaining.toFixed(1)}h remaining`);
              }
            }
          }
          
          // 4. Clear expired cooldowns
          const clearedCooldowns = await db
            .update(gpuWorkers)
            .set({
              cooldownUntil: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(gpuWorkers.provider, 'colab'),
                isNotNull(gpuWorkers.cooldownUntil),
                sql`${gpuWorkers.cooldownUntil} <= ${now}`
              )
            );
          
          if (clearedCooldowns.rowCount && clearedCooldowns.rowCount > 0) {
            logger.info(`✅ Cleared ${clearedCooldowns.rowCount} expired Colab cooldowns`);
          }
          
        } catch (error: any) {
          logger.error(`Colab cooldown enforcer error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // 🔥 JOB 14: GPU Idle Monitor - A cada 5 minutos (ON-DEMAND idle shutdown)
    // CRITICAL: Auto-shutdown idle GPUs (10min threshold) to save quota
    // - Monitors all healthy GPUs for inference activity
    // - Gracefully shuts down via orchestrator (Kaggle/Colab)
    // - Prevents quota waste from idle sessions
    this.register({
      name: 'gpu-idle-monitor',
      schedule: '*/5 * * * *', // A cada 5 minutos
      task: async () => {
        try {
          await onDemandGPUService.checkIdleGPUs();
        } catch (error: any) {
          logger.error(`GPU idle monitor error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // 🔥 JOB 15: Conversation Finalizer - A cada 10 minutos (Consolidate inactive chats for curation)
    // CRITICAL: Detects conversations that have been idle for 10+ minutes
    // Consolidates all messages into a single curation item with full transcript + attachments
    this.register({
      name: 'conversation-finalizer',
      schedule: '*/10 * * * *', // A cada 10 minutos
      task: async () => {
        try {
          const { conversationFinalizer } = await import('../curation/conversation-finalizer');
          
          // Finalize conversations inactive for 10+ minutes
          const finalized = await conversationFinalizer.finalizeInactiveConversations(10);
          
          if (finalized > 0) {
            logger.info(`✅ Conversation Finalizer: ${finalized} conversas consolidadas e enviadas para curadoria`);
          }
        } catch (error: any) {
          logger.error(`Conversation finalizer error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // 🔥 JOB 16: Auto-Curator Processor - A cada 10 minutos (Process curation queue)
    // CRITICAL: Auto-processes items in curation queue using AutoApprovalService
    // - Fetches pending items from queue
    // - Applies auto-approval logic (score thresholds, flags, namespaces)
    // - Auto-approves high-quality content (score >= 80)
    // - Auto-rejects low-quality content (score < 50)
    // - Leaves medium-quality for human review (50-79)
    this.register({
      name: 'auto-curator-processor',
      schedule: '*/10 * * * *', // A cada 10 minutos
      task: async () => {
        try {
          const { curationStore } = await import('../curation/store');
          const { autoApprovalService } = await import('./auto-approval-service');
          
          // Get all pending items
          const pendingItems = await curationStore.listPending();
          
          // Process max 50 items per run to avoid overload
          const itemsToProcess = pendingItems.slice(0, 50);
          
          let approved = 0;
          let rejected = 0;
          let reviewed = 0;
          
          // Get config to check requireAllQualityGates
          const config = await autoApprovalService.getConfig();
          
          // Process each pending item through auto-approval logic
          for (const item of itemsToProcess) {
            // PREFERRED: Use structured autoAnalysis if available (enterprise feature)
            const autoAnalysis = (item as any).autoAnalysis;
            
            let qualityScore: number;
            let contentFlags: string[];
            let suggestedNamespaces: string[];
            
            if (autoAnalysis && typeof autoAnalysis === 'object') {
              // ✅ ENTERPRISE PATH: Use structured analysis from curator-agent
              qualityScore = autoAnalysis.score || 0;
              contentFlags = Array.isArray(autoAnalysis.flags) ? autoAnalysis.flags : [];
              suggestedNamespaces = Array.isArray(autoAnalysis.suggestedNamespaces) 
                ? autoAnalysis.suggestedNamespaces 
                : (item.suggestedNamespaces || []);
              
              logger.info(`✅ Item ${item.id} has structured autoAnalysis (score: ${qualityScore}, flags: ${contentFlags.join(',') || 'none'})`);
            } else {
              // ⚠️  FALLBACK: Legacy items without autoAnalysis - skip auto-approval (HITL required)
              logger.info(`⚠️  Item ${item.id} missing autoAnalysis - requiring HITL review`);
              reviewed++;
              continue; // Skip items without structured analysis (safety first)
            }
            
            // SAFETY: Auto-approval requires score > 0 AND proper analysis
            const qualityGatesPassed = qualityScore > 0 && autoAnalysis.recommended !== 'reject';
            
            // SAFETY: If requireAllQualityGates is enabled and item failed quality gates,
            // skip auto-approval and leave for human review (defensive approach)
            if (config.requireAllQualityGates && !qualityGatesPassed) {
              logger.info(`⚠️  Item ${item.id} skipped (failed quality gates, HITL required)`);
              reviewed++;
              continue;
            }
            
            // Extract query text from content (first 500 chars for frequency matching)
            const queryText = item.content?.substring(0, 500) || '';
            const primaryNamespace = suggestedNamespaces && suggestedNamespaces.length > 0 ? suggestedNamespaces[0] : undefined;
            
            const decision = await autoApprovalService.decide(
              qualityScore,
              contentFlags,
              suggestedNamespaces,
              qualityGatesPassed, // 4th param: optional quality gates
              queryText // 5th param: CRITICAL for reuse gate to work
            );
            
            if (decision.action === 'approve') {
              // Check if approved via reuse gate (for audit trail)
              const isReuseGateApproval = decision.reason.includes('High-reuse value');
              const isGreetingGate = decision.reason.includes('Greeting/casual phrase');
              const approvalNote = isReuseGateApproval 
                ? `${decision.reason} [REUSE-GATE]`
                : isGreetingGate
                ? `${decision.reason} [GREETING-GATE]`
                : decision.reason;
              
              try {
                await curationStore.approveAndPublish(item.id, 'AUTO-CURATOR', approvalNote);
                approved++;
              } catch (approveError: any) {
                // FIX #2: Handle duplicate constraint gracefully (race condition protection)
                const isDuplicateError = approveError.message?.includes('duplicate key') || 
                                        approveError.message?.includes('content_hash_unique') ||
                                        approveError.code === '23505';
                
                if (isDuplicateError) {
                  // NO-OP: Don't increment any counter (already in KB, not a review item)
                  logger.info(`ℹ️  Item ${item.id} duplicate detected during approval - skipping (already in KB, no action needed)`);
                } else {
                  // Real error - requires manual review
                  logger.error(`❌ Failed to auto-approve item ${item.id}: ${approveError.message}`);
                  reviewed++;
                }
              }
            } else if (decision.action === 'reject') {
              await curationStore.reject(item.id, 'AUTO-CURATOR', decision.reason);
              rejected++;
            } else {
              reviewed++;
            }
          }
          
          if (itemsToProcess.length > 0) {
            logger.info(`✅ Auto-Curator: Processed ${itemsToProcess.length} items (approved: ${approved}, rejected: ${rejected}, review: ${reviewed})`);
          }
        } catch (error: any) {
          logger.error(`Auto-curator processor error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // 🔥 JOB 17: Query Frequency Decay - Nightly at 03:00 UTC (Cost-optimization maintenance)
    // CRITICAL: Applies exponential decay to query frequencies for accurate reuse tracking
    // - Applies decay factor (0.95^days) to all query counts
    // - Deletes ancient low-value records (>90 days, <2 hits)
    // - Maintains fresh reuse gate data for cost-aware auto-approval
    this.register({
      name: 'query-frequency-decay',
      schedule: '0 3 * * *', // Nightly at 03:00 UTC
      task: async () => {
        try {
          logger.info('🔄 Starting query frequency decay (reuse gate maintenance)');
          
          const { queryFrequencyService } = await import('./query-frequency-service');
          await queryFrequencyService.applyDecay();
          
          logger.info('✅ Query frequency decay completed');
        } catch (error: any) {
          logger.error(`❌ Query frequency decay error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // 🔥 JOB 18: Curation GC - Rejected Items Cleanup (30-day retention)
    // CRITICAL: Implements "Healthy Forgetting" for rejected content
    // - Multi-stage deletion: rejected → expiresAt (30d) → hard delete
    // - Tombstone pattern: metadata retained in audit logs
    // - GDPR compliance: data minimization + storage limitation
    this.register({
      name: 'curation-gc-rejected',
      schedule: '0 2 * * *', // Daily at 02:00 UTC (off-peak hours)
      task: async () => {
        try {
          logger.info('🗑️ Starting curation GC - rejected items cleanup');
          
          const { curationStore } = await import('../curation/store');
          const result = await curationStore.cleanupExpiredRejectedItems();
          
          if (result) {
            logger.info(`✅ Deleted ${result.curationItemsDeleted} expired rejected items (30d retention)`);
          } else {
            logger.info('✅ No expired rejected items to cleanup');
          }
        } catch (error: any) {
          logger.error(`❌ Curation GC (rejected) error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // 🔥 JOB 19: Curation GC - Old Data Cleanup (5-year retention)
    // CRITICAL: Removes approved/rejected items older than 5 years
    // - Compliance: LGPD Art. 16 (legitimate retention period)
    // - Keeps pending items indefinitely (HITL review required)
    // - Runs monthly (1st day) for performance optimization
    this.register({
      name: 'curation-gc-old-data',
      schedule: '0 6 1 * *', // Monthly on 1st day at 06:00 UTC
      task: async () => {
        try {
          logger.info('🗄️ Starting curation GC - 5-year retention cleanup');
          
          const { curationStore } = await import('../curation/store');
          const result = await curationStore.cleanupOldCurationData();
          
          if (result) {
            logger.info(`✅ Deleted ${result.curationItemsDeleted} curation items older than 5 years`);
          } else {
            logger.info('✅ No old curation data to cleanup');
          }
        } catch (error: any) {
          logger.error(`❌ Curation GC (old data) error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    // 🔥 JOB 20: Tombstone Cleanup - Diariamente às 02:00 UTC (Retention policy enforcement)
    // CRITICAL: Deletes expired tombstones based on retention policies
    // Respects retentionUntil field (NULL = keep forever)
    // Comprehensive audit logging for GDPR compliance
    this.register({
      name: 'tombstone-cleanup',
      schedule: '0 2 * * *', // Diariamente às 02:00 UTC
      task: async () => {
        try {
          logger.info('🧹 Starting tombstone cleanup (retention policy enforcement)');
          
          // 1. Apply retention policies to tombstones without explicit retentionUntil
          const applyResult = await retentionPolicyService.applyRetentionPolicies(false);
          
          if (applyResult.tombstonesUpdated > 0) {
            logger.info(`✅ Applied retention policies to ${applyResult.tombstonesUpdated} tombstones`);
          }
          
          // 2. Cleanup expired tombstones (retentionUntil < now)
          const cleanupResult = await retentionPolicyService.cleanupExpiredTombstones(false);
          
          if (cleanupResult.tombstonesDeleted > 0) {
            logger.info(`✅ Deleted ${cleanupResult.tombstonesDeleted} expired tombstones`);
          } else {
            logger.info('✅ No expired tombstones to cleanup');
          }
          
          // 3. Log retention stats
          const stats = await retentionPolicyService.getStats();
          logger.info('📊 Retention policy stats:', stats);
          
        } catch (error: any) {
          logger.error(`❌ Tombstone cleanup error: ${error.message}`);
        }
      },
      enabled: true,
      runCount: 0,
      errorCount: 0,
    });

    logger.info(`SchedulerService: ${this.jobs.size} jobs registrados`);
  }

  /**
   * Registrar um job individual
   */
  register(job: ScheduledJob): void {
    this.jobs.set(job.name, job);
    logger.info(`SchedulerService: Job registrado - ${job.name} (${job.schedule})`);
  }

  /**
   * Iniciar todos os jobs agendados
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('SchedulerService já está rodando');
      return;
    }

    logger.info('═══════════════════════════════════════════════════════════════════');
    logger.info('║   ⏰ PRODUCTION SCHEDULER SERVICE - INICIANDO...              ║');
    logger.info('═══════════════════════════════════════════════════════════════════');

    for (const [name, jobConfig] of Array.from(this.jobs.entries())) {
      if (!jobConfig.enabled) {
        logger.info(`Scheduler: Job ${name} desabilitado`);
        continue;
      }

      try {
        // Criar cron job com error handling
        const cronJob = cron.schedule(
          jobConfig.schedule,
          async () => {
            await this.executeJob(name);
          },
          {
            timezone: 'America/Sao_Paulo',
          }
        );

        jobConfig.job = cronJob;
        jobConfig.nextRun = this.getNextRun(jobConfig.schedule);

        logger.info(`Scheduler: Job ${name} agendado (${jobConfig.schedule})`, { 
          nextRun: jobConfig.nextRun?.toISOString() 
        });

      } catch (error: any) {
        logger.error(`Falha ao agendar job ${name}`, { error: error.message });
      }
    }

    this.isRunning = true;
    logger.info('Scheduler Service ATIVO - Todos os jobs agendados');
  }

  /**
   * Executar job com error handling e telemetria
   */
  private async executeJob(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) return;

    const startTime = Date.now();

    try {
      logger.info(`Scheduler: Iniciando job ${name}`, { startTime: new Date().toISOString() });

      await job.task();

      const duration = Date.now() - startTime;
      job.runCount++;
      job.lastRun = new Date();
      job.nextRun = this.getNextRun(job.schedule);

      logger.info(`Scheduler: Job ${name} concluído`, { 
        duration: `${duration}ms`, 
        runCount: job.runCount,
        nextRun: job.nextRun?.toISOString()
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      job.errorCount++;

      logger.error(`Scheduler: Job ${name} falhou`, { duration: `${duration}ms`, error: error.message, errorCount: job.errorCount });
       

      // TODO: Integrar com sistema de alertas (email, Slack, etc)
      if (job.errorCount > 10) {
        logger.error(`Scheduler: CRÍTICO - Job ${name} tem mais de 10 falhas consecutivas`, { errorCount: job.errorCount });
      }
    }
  }

  /**
   * Calcular próxima execução do cron
   */
  private getNextRun(schedule: string): Date | undefined {
    try {
      const task = cron.schedule(schedule, () => {}, {
        timezone: 'America/Sao_Paulo',
      });
      // @ts-ignore - node-cron internal API
      const next = task.nextDates(1)?.[0];
      task.stop();
      return next ? new Date(next) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Parar todos os jobs
   */
  stop(): void {
    logger.info('SchedulerService: Parando todos os jobs');

    for (const [name, job] of Array.from(this.jobs.entries())) {
      if (job.job) {
        job.job.stop();
        logger.info(`Job ${name} parado`);
      }
    }

    this.isRunning = false;
    logger.info('Scheduler Service parado');
  }

  /**
   * Executar job manualmente (para testes)
   */
  async runNow(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job '${name}' não encontrado`);
    }

    logger.info(`SchedulerService: Executando job '${name}' manualmente`);
    await this.executeJob(name);
  }

  /**
   * Listar status de todos os jobs
   */
  getStatus(): Array<{
    name: string;
    schedule: string;
    enabled: boolean;
    running: boolean;
    lastRun?: string;
    nextRun?: string;
    runCount: number;
    errorCount: number;
    errorRate: string;
  }> {
    const status = [];

    for (const [name, job] of Array.from(this.jobs.entries())) {
      const errorRate = job.runCount > 0
        ? `${((job.errorCount / job.runCount) * 100).toFixed(1)}%`
        : '0%';

      status.push({
        name,
        schedule: job.schedule,
        enabled: job.enabled,
        running: this.isRunning,
        lastRun: job.lastRun?.toISOString(),
        nextRun: job.nextRun?.toISOString(),
        runCount: job.runCount,
        errorCount: job.errorCount,
        errorRate,
      });
    }

    return status;
  }

  /**
   * Habilitar/desabilitar job específico
   */
  setJobEnabled(name: string, enabled: boolean): void {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job '${name}' não encontrado`);
    }

    job.enabled = enabled;

    if (this.isRunning) {
      if (enabled && !job.job) {
        // Iniciar job
        const cronJob = cron.schedule(job.schedule, async () => {
          await this.executeJob(name);
        }, {
          timezone: 'America/Sao_Paulo',
        });
        job.job = cronJob;
        logger.info(`SchedulerService: Job ${name} habilitado`);
      } else if (!enabled && job.job) {
        // Parar job
        job.job.stop();
        job.job = undefined;
        logger.info(`SchedulerService: Job ${name} desabilitado`);
      }
    }
  }
}

// Singleton
export const schedulerService = new SchedulerService();

/**
 * API de controle (para endpoints REST)
 */
export const SchedulerAPI = {
  start: () => schedulerService.start(),
  stop: () => schedulerService.stop(),
  runNow: (jobName: string) => schedulerService.runNow(jobName),
  getStatus: () => schedulerService.getStatus(),
  setJobEnabled: (jobName: string, enabled: boolean) => 
    schedulerService.setJobEnabled(jobName, enabled),
};
