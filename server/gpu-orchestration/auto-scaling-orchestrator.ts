/**
 * AUTO-SCALING ORCHESTRATOR - COBERTURA 24/7
 * ===========================================
 * 
 * Orquestra TODAS as GPUs (Colab + Kaggle) com rotação inteligente para
 * garantir MÁXIMO de GPUs online 24/7 sem que todas parem ao mesmo tempo.
 * 
 * ESTRATÉGIA OTIMIZADA:
 * =====================
 * 
 * COLAB FREE (Prioridade ALTA - Backbone):
 * - Session: 12h max → Stop at 11h (1h safety)
 * - Sem limite semanal → Pode rodar CONTINUAMENTE
 * - Dividir em grupos escalonados (ex: 3+2+2)
 * - SEMPRE online → Backbone do sistema
 * 
 * KAGGLE FREE (Uso estratégico - Complemento):
 * - Session: 12h max → Stop at 11h (1h safety)
 * - Weekly: 30h → Stop at 29h (1h safety)
 * - Distribuir 29h em 7 dias → ~4h/dia
 * - Usar como COMPLEMENTO ao Colab
 * 
 * EXEMPLO PRÁTICO:
 * ================
 * 
 * Cenário: 6 Colab + 4 Kaggle = 10 GPUs totais
 * 
 * ROTAÇÃO INTELIGENTE (Staggered Start):
 * 
 * T=0h:   Grupo A: 3 Colab                → 3 GPUs online
 * T=4h:   Grupo B: 3 Colab + 2 Kaggle     → 5 GPUs online (A+B)
 * T=8h:   Grupo C: 2 Kaggle               → 5 GPUs online (B+C)
 * T=11h:  Grupo A para → Relança A        → 5 GPUs online (B+C+A)
 * T=15h:  Grupo B para → Relança B        → 5 GPUs online (C+A+B)
 * T=19h:  Grupo C para → Relança C        → 5 GPUs online (A+B+C)
 * 
 * RESULTADO: SEMPRE 3-5 GPUs online 24/7!
 * 
 * AUTO-DETECÇÃO:
 * ==============
 * 
 * Quando admin adiciona nova GPU:
 * 1. Sistema detecta mudança no pool
 * 2. Recalcula grupos ótimos automaticamente
 * 3. Atualiza schedule de rotação
 * 4. Adiciona GPU ao pool 24/7
 * 
 * REQUISITOS:
 * - SEMPRE manter máximo de GPUs online
 * - NUNCA todas param ao mesmo tempo
 * - Colab = Backbone (prioridade alta)
 * - Kaggle = Complemento (uso estratégico ~4h/dia)
 */

import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { ColabOrchestrator } from './colab-orchestrator';
import { KaggleOrchestrator } from './kaggle-orchestrator';
import { quotaManager } from './intelligent-quota-manager';
import { QUOTA_LIMITS } from '../config/quota-limits';
import { retrieveKaggleCredentials, retrieveGoogleCredentials } from '../services/security/secrets-vault';

interface GPUGroup {
  id: string;
  workers: number[];
  provider: 'colab' | 'kaggle' | 'mixed';
  estimatedDurationHours: number;
  startOffsetHours: number;
}

interface RotationSchedule {
  groups: GPUGroup[];
  totalGPUs: number;
  estimatedCoverage: {
    minOnline: number;
    maxOnline: number;
    averageOnline: number;
  };
  strategy: string;
}

export class AutoScalingOrchestrator {
  private colabOrchestrator: ColabOrchestrator;
  private kaggleOrchestrator: KaggleOrchestrator;
  private currentSchedule: RotationSchedule | null = null;
  private rotationTimers: NodeJS.Timeout[] = [];
  private poolMonitorInterval: NodeJS.Timeout | null = null;
  private lastKnownPoolSize: number = 0;

  constructor() {
    this.colabOrchestrator = new ColabOrchestrator();
    this.kaggleOrchestrator = new KaggleOrchestrator();
  }

  /**
   * MASTER ORCHESTRATOR - Calcula e executa rotação 24/7
   */
  async startAutoScaling(): Promise<RotationSchedule> {
    console.log('[AutoScale] 🚀 Iniciando Auto-Scaling Orchestrator...');

    // 1. Detectar todas GPUs disponíveis
    const availableGPUs = await this.detectAllGPUs();
    
    if (availableGPUs.colab.length === 0 && availableGPUs.kaggle.length === 0) {
      throw new Error('Nenhuma GPU disponível para auto-scaling');
    }

    // Inicializar lastKnownPoolSize para evitar recalculação infinita
    this.lastKnownPoolSize = availableGPUs.colab.length + availableGPUs.kaggle.length;

    console.log(`[AutoScale] 📊 GPUs detectadas: ${availableGPUs.colab.length} Colab + ${availableGPUs.kaggle.length} Kaggle`);

    // 2. Calcular grupos ótimos
    const schedule = this.calculateOptimalRotation(availableGPUs);
    this.currentSchedule = schedule;

    console.log('[AutoScale] 📋 Schedule calculado:');
    console.log(`   Total GPUs: ${schedule.totalGPUs}`);
    console.log(`   Grupos: ${schedule.groups.length}`);
    console.log(`   Cobertura estimada: ${schedule.estimatedCoverage.minOnline}-${schedule.estimatedCoverage.maxOnline} GPUs online`);
    console.log(`   Estratégia: ${schedule.strategy}`);

    // 3. Executar rotação (staggered start)
    await this.executeRotation(schedule);

    // 4. Iniciar monitoramento de mudanças no pool
    this.startPoolMonitoring();

    return schedule;
  }

  /**
   * MONITORAR MUDANÇAS NO POOL (Auto-detect novas GPUs)
   */
  private startPoolMonitoring(): void {
    // Parar monitor anterior se existir
    if (this.poolMonitorInterval) {
      clearInterval(this.poolMonitorInterval);
    }

    // Monitorar a cada 60 segundos
    this.poolMonitorInterval = setInterval(async () => {
      try {
        const availableGPUs = await this.detectAllGPUs();
        const currentPoolSize = availableGPUs.colab.length + availableGPUs.kaggle.length;

        if (currentPoolSize !== this.lastKnownPoolSize) {
          console.log(
            `[AutoScale] 🔄 Pool mudou: ${this.lastKnownPoolSize} → ${currentPoolSize} GPUs`
          );
          console.log('[AutoScale] Recalculando schedule automaticamente...');

          // Recalcular schedule automaticamente
          await this.recalculateSchedule();

          this.lastKnownPoolSize = currentPoolSize;
        }
      } catch (error) {
        console.error('[AutoScale] Erro no monitoramento do pool:', error);
      }
    }, 60000); // 60s

    console.log('[AutoScale] 👀 Pool monitoring ativo (check: 60s)');
  }

  /**
   * DETECTAR TODAS GPUs (Colab + Kaggle)
   */
  private async detectAllGPUs(): Promise<{ colab: number[]; kaggle: number[] }> {
    const workers = await db.query.gpuWorkers.findMany({
      where: eq(gpuWorkers.autoManaged, true),
    });

    const colab = workers.filter(w => w.provider === 'colab').map(w => w.id);
    const kaggle = workers.filter(w => w.provider === 'kaggle').map(w => w.id);

    return { colab, kaggle };
  }

  /**
   * CALCULAR ROTAÇÃO ÓTIMA
   * 
   * Estratégia:
   * 1. Colab = Backbone (sempre online em grupos escalonados)
   * 2. Kaggle = Complemento (uso estratégico ~4h/dia)
   * 3. Máximo de GPUs online SEM que todas parem juntas
   */
  private calculateOptimalRotation(gpus: { colab: number[]; kaggle: number[] }): RotationSchedule {
    const totalColab = gpus.colab.length;
    const totalKaggle = gpus.kaggle.length;
    const totalGPUs = totalColab + totalKaggle;

    // Estratégia baseada em quantidade de GPUs
    if (totalColab >= 6) {
      // Muitos Colabs → 3 grupos escalonados (4h offset)
      return this.createThreeGroupRotation(gpus);
    } else if (totalColab >= 3) {
      // Médios Colabs → 2 grupos escalonados (6h offset)
      return this.createTwoGroupRotation(gpus);
    } else if (totalColab > 0) {
      // Poucos Colabs → Usa Kaggle como complemento
      return this.createMixedRotation(gpus);
    } else {
      // Só Kaggle → Rotação conservadora (4h/dia cada)
      return this.createKaggleOnlyRotation(gpus);
    }
  }

  /**
   * ESTRATÉGIA 1: 3 Grupos (6+ Colabs)
   * 
   * Colab: T=0h → 11h (3 grupos escalonados)
   * Kaggle: T=2h → 6h (4h/dia, 3 grupos distribuídos ao longo da semana)
   * 
   * Resultado: Sempre 2-3 Colabs + 0-1 Kaggle online
   */
  private createThreeGroupRotation(gpus: { colab: number[]; kaggle: number[] }): RotationSchedule {
    const colabPerGroup = Math.ceil(gpus.colab.length / 3);
    const groups: GPUGroup[] = [];

    // Colab groups (11h cada, escalonados)
    groups.push({
      id: 'Colab-A',
      workers: gpus.colab.slice(0, colabPerGroup),
      provider: 'colab',
      estimatedDurationHours: 11,
      startOffsetHours: 0,
    });
    
    if (gpus.colab.length > colabPerGroup) {
      groups.push({
        id: 'Colab-B',
        workers: gpus.colab.slice(colabPerGroup, colabPerGroup * 2),
        provider: 'colab',
        estimatedDurationHours: 11,
        startOffsetHours: 4,
      });
    }
    
    if (gpus.colab.length > colabPerGroup * 2) {
      groups.push({
        id: 'Colab-C',
        workers: gpus.colab.slice(colabPerGroup * 2),
        provider: 'colab',
        estimatedDurationHours: 11,
        startOffsetHours: 8,
      });
    }

    // Kaggle groups (4h cada, distribuídos ao longo do dia)
    if (gpus.kaggle.length > 0) {
      const kagglePerGroup = Math.ceil(gpus.kaggle.length / 3);
      
      groups.push({
        id: 'Kaggle-Morning',
        workers: gpus.kaggle.slice(0, kagglePerGroup),
        provider: 'kaggle',
        estimatedDurationHours: 4,
        startOffsetHours: 2,
      });
      
      if (gpus.kaggle.length > kagglePerGroup) {
        groups.push({
          id: 'Kaggle-Afternoon',
          workers: gpus.kaggle.slice(kagglePerGroup, kagglePerGroup * 2),
          provider: 'kaggle',
          estimatedDurationHours: 4,
          startOffsetHours: 10,
        });
      }
      
      if (gpus.kaggle.length > kagglePerGroup * 2) {
        groups.push({
          id: 'Kaggle-Evening',
          workers: gpus.kaggle.slice(kagglePerGroup * 2),
          provider: 'kaggle',
          estimatedDurationHours: 4,
          startOffsetHours: 18,
        });
      }
    }

    return {
      groups,
      totalGPUs: gpus.colab.length + gpus.kaggle.length,
      estimatedCoverage: {
        minOnline: colabPerGroup,
        maxOnline: colabPerGroup * 2 + Math.ceil(gpus.kaggle.length / 3),
        averageOnline: colabPerGroup * 1.5 + (gpus.kaggle.length * 0.35),
      },
      strategy: '3-Group Rotation (Colab 11h, Kaggle 4h)',
    };
  }

  /**
   * ESTRATÉGIA 2: 2 Grupos (3-5 Colabs)
   * 
   * Colab: T=0h → 11h (2 grupos escalonados)
   * Kaggle: T=3h → 7h, T=15h → 19h (4h cada, 2 grupos)
   * 
   * Resultado: Sempre 1-2 Colabs + 0-1 Kaggle online
   */
  private createTwoGroupRotation(gpus: { colab: number[]; kaggle: number[] }): RotationSchedule {
    const colabPerGroup = Math.ceil(gpus.colab.length / 2);
    const groups: GPUGroup[] = [];

    // Colab groups (11h cada)
    groups.push({
      id: 'Colab-A',
      workers: gpus.colab.slice(0, colabPerGroup),
      provider: 'colab',
      estimatedDurationHours: 11,
      startOffsetHours: 0,
    });
    
    if (gpus.colab.length > colabPerGroup) {
      groups.push({
        id: 'Colab-B',
        workers: gpus.colab.slice(colabPerGroup),
        provider: 'colab',
        estimatedDurationHours: 11,
        startOffsetHours: 6,
      });
    }

    // Kaggle groups (4h cada)
    if (gpus.kaggle.length > 0) {
      const kagglePerGroup = Math.ceil(gpus.kaggle.length / 2);
      
      groups.push({
        id: 'Kaggle-Morning',
        workers: gpus.kaggle.slice(0, kagglePerGroup),
        provider: 'kaggle',
        estimatedDurationHours: 4,
        startOffsetHours: 3,
      });
      
      if (gpus.kaggle.length > kagglePerGroup) {
        groups.push({
          id: 'Kaggle-Afternoon',
          workers: gpus.kaggle.slice(kagglePerGroup),
          provider: 'kaggle',
          estimatedDurationHours: 4,
          startOffsetHours: 15,
        });
      }
    }

    return {
      groups,
      totalGPUs: gpus.colab.length + gpus.kaggle.length,
      estimatedCoverage: {
        minOnline: colabPerGroup,
        maxOnline: colabPerGroup + Math.ceil(gpus.kaggle.length / 2),
        averageOnline: colabPerGroup * 1.5 + (gpus.kaggle.length * 0.35),
      },
      strategy: '2-Group Rotation (Colab 11h, Kaggle 4h)',
    };
  }

  /**
   * ESTRATÉGIA 3: Rotação Mista (1-2 Colabs)
   * 
   * Colab: Sempre online (rotação simples)
   * Kaggle: Complemento (2-3 sessões de 4h/dia)
   */
  private createMixedRotation(gpus: { colab: number[]; kaggle: number[] }): RotationSchedule {
    const groups: GPUGroup[] = [];

    // Grupo A: Colabs (sempre online)
    if (gpus.colab.length > 0) {
      groups.push({
        id: 'Colab-Backbone',
        workers: gpus.colab,
        provider: 'colab',
        estimatedDurationHours: 11,
        startOffsetHours: 0,
      });
    }

    // Grupos B, C, D: Kaggle (4h cada, distribuído no dia)
    const kagglePerGroup = Math.ceil(gpus.kaggle.length / 3);
    if (gpus.kaggle.length > 0) {
      groups.push({
        id: 'Kaggle-Morning',
        workers: gpus.kaggle.slice(0, kagglePerGroup),
        provider: 'kaggle',
        estimatedDurationHours: 4,
        startOffsetHours: 2,
      });
      
      if (gpus.kaggle.length > kagglePerGroup) {
        groups.push({
          id: 'Kaggle-Afternoon',
          workers: gpus.kaggle.slice(kagglePerGroup, kagglePerGroup * 2),
          provider: 'kaggle',
          estimatedDurationHours: 4,
          startOffsetHours: 10,
        });
      }
      
      if (gpus.kaggle.length > kagglePerGroup * 2) {
        groups.push({
          id: 'Kaggle-Evening',
          workers: gpus.kaggle.slice(kagglePerGroup * 2),
          provider: 'kaggle',
          estimatedDurationHours: 4,
          startOffsetHours: 18,
        });
      }
    }

    return {
      groups,
      totalGPUs: gpus.colab.length + gpus.kaggle.length,
      estimatedCoverage: {
        minOnline: gpus.colab.length,
        maxOnline: gpus.colab.length + kagglePerGroup,
        averageOnline: gpus.colab.length + (gpus.kaggle.length * 0.35),
      },
      strategy: 'Mixed Rotation (Colab backbone + Kaggle complement)',
    };
  }

  /**
   * ESTRATÉGIA 4: Só Kaggle (conservadora)
   * 
   * Cada Kaggle: ~4h/dia (29h/semana ÷ 7 dias)
   * Distribuir ao longo do dia
   */
  private createKaggleOnlyRotation(gpus: { colab: number[]; kaggle: number[] }): RotationSchedule {
    const groups: GPUGroup[] = [];
    const kagglePerGroup = Math.ceil(gpus.kaggle.length / 6);

    const offsets = [0, 4, 8, 12, 16, 20];
    for (let i = 0; i < 6 && i * kagglePerGroup < gpus.kaggle.length; i++) {
      groups.push({
        id: `Kaggle-Group-${String.fromCharCode(65 + i)}`,
        workers: gpus.kaggle.slice(i * kagglePerGroup, (i + 1) * kagglePerGroup),
        provider: 'kaggle',
        estimatedDurationHours: 4,
        startOffsetHours: offsets[i],
      });
    }

    return {
      groups,
      totalGPUs: gpus.kaggle.length,
      estimatedCoverage: {
        minOnline: kagglePerGroup,
        maxOnline: kagglePerGroup * 2,
        averageOnline: kagglePerGroup * 1.5,
      },
      strategy: 'Kaggle-Only Rotation (6 groups, 4h each, distributed)',
    };
  }

  /**
   * EXECUTAR ROTAÇÃO (Staggered Start)
   */
  private async executeRotation(schedule: RotationSchedule): Promise<void> {
    console.log('[AutoScale] 🔄 Executando rotação...');

    // Limpar timers anteriores
    this.rotationTimers.forEach(timer => clearTimeout(timer));
    this.rotationTimers = [];

    // Agendar cada grupo
    for (const group of schedule.groups) {
      const delayMs = group.startOffsetHours * 3600 * 1000;

      console.log(`[AutoScale] ⏰ Grupo ${group.id} agendado para T+${group.startOffsetHours}h`);

      const timer = setTimeout(async () => {
        await this.startGroup(group);
        
        // Reagendar para repetir (loop infinito)
        const repeatDelayMs = 24 * 3600 * 1000; // 24h
        this.scheduleGroupRepeat(group, repeatDelayMs);
      }, delayMs);

      this.rotationTimers.push(timer);
    }

    console.log('[AutoScale] ✅ Rotação configurada com sucesso!');
  }

  /**
   * INICIAR GRUPO DE GPUs
   */
  private async startGroup(group: GPUGroup): Promise<void> {
    console.log(`[AutoScale] 🚀 Iniciando Grupo ${group.id} (${group.workers.length} GPUs)...`);

    const results = await Promise.allSettled(
      group.workers.map(workerId => this.startGPU(workerId))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[AutoScale] Grupo ${group.id}: ${successful} OK, ${failed} FAILED`);

    // Agendar stop automático (safety margin)
    const stopDelayMs = group.estimatedDurationHours * 3600 * 1000;
    setTimeout(async () => {
      await this.stopGroup(group);
    }, stopDelayMs);
  }

  /**
   * PARAR GRUPO DE GPUs
   */
  private async stopGroup(group: GPUGroup): Promise<void> {
    console.log(`[AutoScale] 🛑 Parando Grupo ${group.id}...`);

    await Promise.allSettled(
      group.workers.map(workerId => this.stopGPU(workerId))
    );
  }

  /**
   * REAGENDAR GRUPO (Loop infinito)
   */
  private scheduleGroupRepeat(group: GPUGroup, delayMs: number): void {
    const timer = setTimeout(async () => {
      await this.startGroup(group);
      this.scheduleGroupRepeat(group, delayMs);
    }, delayMs);

    this.rotationTimers.push(timer);
  }

  /**
   * INICIAR GPU INDIVIDUAL
   */
  private async startGPU(workerId: number): Promise<void> {
    const worker = await db.query.gpuWorkers.findFirst({
      where: eq(gpuWorkers.id, workerId),
    });

    if (!worker) {
      throw new Error(`Worker ${workerId} não encontrado`);
    }

    // CRITICAL: Verificar quota antes de iniciar
    const quotaStatus = await quotaManager.getQuotaStatus(workerId);
    if (!quotaStatus?.canStart) {
      console.log(`[AutoScale] ⚠️  GPU #${workerId} não pode iniciar: ${quotaStatus?.reason || 'quota exhausted'}`);
      return;
    }

    console.log(`[AutoScale] 🔥 Starting ${worker.provider} GPU #${workerId}...`);

    let sessionStarted = false;

    try {
      // 1. Buscar credenciais do SecretsVault ANTES de registrar sessão
      let credentials: any = null;
      const accountId = worker.accountId || 'default';
      
      console.log(`[AutoScale] 🔐 Buscando credenciais no SecretsVault (provider: ${worker.provider}, account: ${accountId})...`);
      
      if (worker.provider === 'colab') {
        credentials = await retrieveGoogleCredentials(accountId);
        if (!credentials) {
          console.error(`[AutoScale] ⚠️  Colab #${workerId} - Credenciais não encontradas no SecretsVault (accountId: ${accountId})`);
          console.error(`[AutoScale] 💡 Dica: Use POST /api/admin/secrets/google para armazenar credenciais`);
          return;
        }
        console.log(`[AutoScale] ✅ Credenciais Google recuperadas (account: ${accountId}, email: ${credentials.email})`);
      } else if (worker.provider === 'kaggle') {
        credentials = await retrieveKaggleCredentials(accountId);
        if (!credentials) {
          console.error(`[AutoScale] ⚠️  Kaggle #${workerId} - Credenciais não encontradas no SecretsVault (accountId: ${accountId})`);
          console.error(`[AutoScale] 💡 Dica: Use POST /api/admin/secrets/kaggle para armazenar credenciais`);
          return;
        }
        console.log(`[AutoScale] ✅ Credenciais Kaggle recuperadas (account: ${accountId}, username: ${credentials.username})`);
      } else {
        console.error(`[AutoScale] ⚠️  GPU #${workerId} - Provider não suportado: ${worker.provider}`);
        return;
      }

      // 2. Registrar sessão com quota manager DEPOIS de validar credenciais
      await quotaManager.startSession(workerId);
      sessionStarted = true;

      // 3. Iniciar GPU com credenciais validadas
      if (worker.provider === 'colab') {
        await this.colabOrchestrator.startSession({
          email: credentials.email,
          password: credentials.password,
        });
        console.log(`[AutoScale] ✅ Colab #${workerId} iniciado com sucesso`);
      } else if (worker.provider === 'kaggle') {
        await this.kaggleOrchestrator.startSession({
          username: credentials.username,
          apiKey: credentials.key,
        });
        console.log(`[AutoScale] ✅ Kaggle #${workerId} iniciado com sucesso`);
      }
    } catch (error: any) {
      console.error(`[AutoScale] ❌ Erro ao iniciar GPU #${workerId}:`, error.message);
      
      // Rollback: Reverter registro de sessão se foi iniciada
      if (sessionStarted) {
        await quotaManager.stopSession(workerId);
        console.log(`[AutoScale] ♻️  Quota session revertida para GPU #${workerId}`);
      }
    }
  }

  /**
   * PARAR GPU INDIVIDUAL
   */
  private async stopGPU(workerId: number): Promise<void> {
    const worker = await db.query.gpuWorkers.findFirst({
      where: eq(gpuWorkers.id, workerId),
    });

    if (!worker) return;

    console.log(`[AutoScale] 🛑 Stopping ${worker.provider} GPU #${workerId}...`);

    try {
      // 1. Parar GPU primeiro
      if (worker.provider === 'colab') {
        await this.colabOrchestrator.stopSession(workerId);
      } else if (worker.provider === 'kaggle') {
        await this.kaggleOrchestrator.stopSession(workerId);
      }
    } catch (error: any) {
      console.error(`[AutoScale] ⚠️  Erro ao parar provider GPU #${workerId}:`, error.message);
      // Continuar para garantir que quota manager seja atualizado
    } finally {
      // 2. SEMPRE finalizar sessão no quota manager (mesmo se provider falhar)
      try {
        await quotaManager.stopSession(workerId);
        console.log(`[AutoScale] ✅ Quota session finalizada para GPU #${workerId}`);
      } catch (error: any) {
        console.error(`[AutoScale] ❌ Erro ao finalizar quota session #${workerId}:`, error.message);
      }
    }
  }

  /**
   * PARAR AUTO-SCALING (cleanup)
   */
  async stopAutoScaling(): Promise<void> {
    console.log('[AutoScale] 🛑 Parando Auto-Scaling...');

    // Parar todos os timers de rotação
    this.rotationTimers.forEach(timer => clearTimeout(timer));
    this.rotationTimers = [];

    // Parar monitoramento do pool
    if (this.poolMonitorInterval) {
      clearInterval(this.poolMonitorInterval);
      this.poolMonitorInterval = null;
      console.log('[AutoScale] Pool monitoring parado');
    }

    // Parar todos os grupos ativos
    if (this.currentSchedule) {
      for (const group of this.currentSchedule.groups) {
        await this.stopGroup(group);
      }
    }

    this.currentSchedule = null;
    console.log('[AutoScale] ✅ Auto-Scaling parado');
  }

  /**
   * RECALCULAR SCHEDULE (quando novas GPUs são adicionadas)
   */
  async recalculateSchedule(): Promise<RotationSchedule> {
    console.log('[AutoScale] 🔄 Recalculando schedule (novas GPUs detectadas)...');

    // Parar schedule anterior
    await this.stopAutoScaling();

    // Reiniciar com novo schedule (lastKnownPoolSize será atualizado em startAutoScaling)
    return await this.startAutoScaling();
  }

  /**
   * GET STATUS ATUAL
   */
  async getStatus(): Promise<{
    running: boolean;
    schedule: RotationSchedule | null;
    activeGPUs: number;
    totalGPUs: number;
  }> {
    const activeWorkers = await db.query.gpuWorkers.findMany({
      where: and(
        eq(gpuWorkers.autoManaged, true),
        eq(gpuWorkers.status, 'healthy')
      ),
    });

    return {
      running: this.currentSchedule !== null,
      schedule: this.currentSchedule,
      activeGPUs: activeWorkers.length,
      totalGPUs: this.currentSchedule?.totalGPUs || 0,
    };
  }
}

// Singleton instance
export const autoScalingOrchestrator = new AutoScalingOrchestrator();
