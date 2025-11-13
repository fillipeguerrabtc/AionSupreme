/**
 * AUTO-DISCOVER GPU SERVICE - 2025 Enterprise Best Practice
 * ===========================================================
 * 
 * Detects Replit Secrets (KAGGLE_*, COLAB_*) and auto-provisions GPU workers.
 * 
 * REGRAS CRÍTICAS:
 * - ✅ 1 GPU por Secret (ZERO duplicatas!)
 * - ✅ Persistência (sobrevive reinicializações)
 * - ✅ Incremental (só cria GPUs para Secrets NOVOS)
 * - ✅ Sync automático (Secret removido → GPU deletada)
 * 
 * QUOTAS (RISCO DE BAN!):
 * 
 * KAGGLE (ON-DEMAND):
 * - Session: 8.4h (70% × 12h) = 30240s
 * - Weekly: 21h (70% × 30h) = 75600s
 * - Idle: 10min timeout
 * 
 * COLAB (SCHEDULE FIXO):
 * - Session: 8.4h (70% × 12h) = 30240s
 * - Cooldown: 36h = 129600s
 * - ❌ NUNCA on-demand!
 */

import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { GPU_QUOTA_CONSTANTS } from './intelligent-quota-manager';
import pino from 'pino';

const logger = pino({ name: 'AutoDiscoverGPUService' });

interface KaggleAccount {
  index: number;
  username: string;
  key: string;
}

interface ColabAccount {
  index: number;
  email: string;
  password: string;
}

export class AutoDiscoverGPUService {
  /**
   * Main entrypoint - sync GPUs with Replit Secrets
   * 
   * Called on startup + optionally via cron
   */
  async syncGPUsWithSecrets(): Promise<void> {
    logger.info('🔍 AUTO-DISCOVERY: Scanning Replit Secrets for GPU credentials...');

    try {
      // 1. Scan environment variables for Secrets
      const kaggleAccounts = this.scanKaggleSecrets();
      const colabAccounts = this.scanColabSecrets();

      logger.info({
        kaggleCount: kaggleAccounts.length,
        colabCount: colabAccounts.length,
      }, 'Found credentials in Replit Secrets');

      // 2. Sync Kaggle workers
      for (const account of kaggleAccounts) {
        await this.ensureKaggleWorker(account);
      }

      // 3. Sync Colab workers
      for (const account of colabAccounts) {
        await this.ensureColabWorker(account);
      }

      // 4. Cleanup orphaned workers (Secrets removed)
      await this.cleanupOrphanedWorkers(kaggleAccounts, colabAccounts);

      logger.info('✅ AUTO-DISCOVERY: GPU sync completed successfully');

    } catch (error: any) {
      logger.error({ error: error.message }, '❌ AUTO-DISCOVERY: Failed to sync GPUs');
      throw error;
    }
  }

  /**
   * Scan environment for KAGGLE_USERNAME_1, KAGGLE_KEY_1, KAGGLE_USERNAME_2, etc
   */
  private scanKaggleSecrets(): KaggleAccount[] {
    const accounts: KaggleAccount[] = [];
    let i = 1;

    while (process.env[`KAGGLE_USERNAME_${i}`] && process.env[`KAGGLE_KEY_${i}`]) {
      accounts.push({
        index: i,
        username: process.env[`KAGGLE_USERNAME_${i}`]!,
        key: process.env[`KAGGLE_KEY_${i}`]!,
      });
      i++;
    }

    logger.info({ count: accounts.length }, '🔎 Scanned Kaggle Secrets');
    return accounts;
  }

  /**
   * Scan environment for COLAB_EMAIL_1, COLAB_PASSWORD_1, COLAB_EMAIL_2, etc
   */
  private scanColabSecrets(): ColabAccount[] {
    const accounts: ColabAccount[] = [];
    let i = 1;

    while (process.env[`COLAB_EMAIL_${i}`] && process.env[`COLAB_PASSWORD_${i}`]) {
      accounts.push({
        index: i,
        email: process.env[`COLAB_EMAIL_${i}`]!,
        password: process.env[`COLAB_PASSWORD_${i}`]!,
      });
      i++;
    }

    logger.info({ count: accounts.length }, '🔎 Scanned Colab Secrets');
    return accounts;
  }

  /**
   * Ensure Kaggle worker exists (create if new, skip if exists)
   * 
   * ANTI-DUPLICATA: Query by (provider='kaggle' AND accountId='kaggle-N')
   */
  private async ensureKaggleWorker(account: KaggleAccount): Promise<void> {
    const accountId = `kaggle-${account.index}`;

    // Check if already exists
    const existing = await db.query.gpuWorkers.findFirst({
      where: and(
        eq(gpuWorkers.provider, 'kaggle'),
        eq(gpuWorkers.accountId, accountId)
      ),
    });

    if (existing) {
      logger.info({ accountId, workerId: existing.id }, '♻️ Kaggle worker already exists - skipping');
      return;
    }

    // Create new GPU worker (status='offline', persistent)
    logger.info({ accountId, username: account.username }, '🆕 Creating new Kaggle GPU worker');

    const [worker] = await db.insert(gpuWorkers).values({
      provider: 'kaggle',
      accountId: accountId,
      ngrokUrl: `pending-autodiscovery-${accountId}-${Date.now()}`, // Unique placeholder
      status: 'offline',
      capabilities: {
        gpu: 'T4',
        model: 'llama-3-8b-lora',
        tor_enabled: false,
      },
      autoManaged: true,

      // 🔥 QUOTA ENFORCEMENT (70% safety to prevent BAN!)
      maxSessionDurationSeconds: GPU_QUOTA_CONSTANTS.KAGGLE_GPU_SAFETY, // 8.4h
      maxWeeklySeconds: GPU_QUOTA_CONSTANTS.KAGGLE_WEEKLY_SAFETY, // 21h
      weeklyUsageSeconds: 0,
      weekStartedAt: new Date(),

      // ON-DEMAND activation (NOT schedule-based)
      sessionStartedAt: null,
      sessionDurationSeconds: 0,
      cooldownUntil: null, // Kaggle doesn't have cooldown (only Colab)
    }).returning();

    logger.info({ 
      accountId, 
      workerId: worker.id,
      sessionLimit: '8.4h',
      weeklyLimit: '21h',
    }, '✅ Kaggle GPU worker created successfully (ON-DEMAND activation)');
  }

  /**
   * Ensure Colab worker exists (create if new, skip if exists)
   * 
   * ANTI-DUPLICATA: Query by (provider='colab' AND accountId='colab-N')
   */
  private async ensureColabWorker(account: ColabAccount): Promise<void> {
    const accountId = `colab-${account.index}`;

    // Check if already exists
    const existing = await db.query.gpuWorkers.findFirst({
      where: and(
        eq(gpuWorkers.provider, 'colab'),
        eq(gpuWorkers.accountId, accountId)
      ),
    });

    if (existing) {
      logger.info({ accountId, workerId: existing.id }, '♻️ Colab worker already exists - skipping');
      return;
    }

    // Create new GPU worker (status='offline', persistent)
    logger.info({ accountId, email: account.email }, '🆕 Creating new Colab GPU worker');

    const [worker] = await db.insert(gpuWorkers).values({
      provider: 'colab',
      accountId: accountId,
      ngrokUrl: `pending-autodiscovery-${accountId}-${Date.now()}`, // Unique placeholder
      status: 'offline',
      capabilities: {
        gpu: 'T4',
        model: 'llama-3-8b-lora',
        tor_enabled: false,
      },
      autoManaged: true,

      // 🔥 QUOTA ENFORCEMENT (70% safety + 36h cooldown to prevent BAN!)
      maxSessionDurationSeconds: GPU_QUOTA_CONSTANTS.COLAB_SAFETY, // 8.4h
      maxWeeklySeconds: null, // Colab doesn't have weekly quota (only cooldown)
      weeklyUsageSeconds: 0,

      // SCHEDULE-BASED activation (NOT on-demand!)
      sessionStartedAt: null,
      sessionDurationSeconds: 0,
      cooldownUntil: null, // Will be set by scheduler after session ends
    }).returning();

    logger.info({ 
      accountId, 
      workerId: worker.id,
      sessionLimit: '8.4h',
      cooldown: '36h',
    }, '✅ Colab GPU worker created successfully (SCHEDULE-BASED activation)');
  }

  /**
   * Delete workers whose Secrets were removed
   * 
   * SYNC AUTOMÁTICO: Secret removido → GPU deletada
   */
  private async cleanupOrphanedWorkers(
    kaggleAccounts: KaggleAccount[],
    colabAccounts: ColabAccount[]
  ): Promise<void> {
    // Build list of valid accountIds
    const validAccountIds = new Set<string>();

    for (const account of kaggleAccounts) {
      validAccountIds.add(`kaggle-${account.index}`);
    }

    for (const account of colabAccounts) {
      validAccountIds.add(`colab-${account.index}`);
    }

    // Find all auto-managed workers
    const allWorkers = await db.query.gpuWorkers.findMany({
      where: eq(gpuWorkers.autoManaged, true),
    });

    // Delete workers not in valid list
    for (const worker of allWorkers) {
      if (worker.accountId && !validAccountIds.has(worker.accountId)) {
        logger.warn({ 
          workerId: worker.id, 
          accountId: worker.accountId,
          provider: worker.provider,
        }, '🗑️ Deleting orphaned worker (Secret removed from Replit)');

        await db.delete(gpuWorkers).where(eq(gpuWorkers.id, worker.id));
      }
    }

    const orphansCount = allWorkers.filter(w => w.accountId && !validAccountIds.has(w.accountId)).length;

    if (orphansCount > 0) {
      logger.info({ orphansDeleted: orphansCount }, '🧹 Cleanup completed - orphaned workers removed');
    }
  }
}

// Singleton export
export const autoDiscoverGPUService = new AutoDiscoverGPUService();
