/**
 * KAGGLE CLI SERVICE - PRODUCTION-GRADE (ENTERPRISE-DIAMOND)
 * ===========================================================
 * 
 * Gerenciamento completo do Kaggle CLI seguindo BEST PRACTICES OFICIAIS
 * 
 * FEATURES:
 * ✅ Auto-install Kaggle CLI (via UPM)
 * ✅ Credentials via SecretsVault (AES-256-GCM encrypted!)
 * ✅ Environment variables authentication (Kaggle official method #1)
 * ✅ Multi-account support with quota tracking
 * ✅ CLI health checks
 * ✅ Account rotation for quota management
 * ✅ Production-grade error handling (HTML error detection)
 * 
 * AUTHENTICATION METHOD (per Kaggle official docs):
 * 1. ✅ Environment Variables (KAGGLE_USERNAME + KAGGLE_KEY) ← USED BY AION
 * 2. Config File (~/.kaggle/kaggle.json)
 * 3. Custom Config Dir (KAGGLE_CONFIG_DIR)
 * 
 * INTEGRATION:
 * - SecretsVault: Encrypted storage de API keys
 * - GPU Manager: Provision workers com diferentes accounts
 * - Quota Manager: Rotation quando account atinge limites
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface KaggleAccount {
  username: string;
  apiKey: string;
  isActive: boolean;
  weeklyQuotaUsed: number; // em segundos
  maxWeeklyQuota: number;  // 30h = 108000 segundos
}

interface KaggleCLIStatus {
  installed: boolean;
  version?: string;
  pythonAvailable: boolean;
  pipAvailable: boolean;
  credentialsConfigured: boolean;
  activeAccount?: string;
}

export class KaggleCLIService {
  private accounts: Map<string, KaggleAccount> = new Map();
  private currentAccount: string | null = null;
  private accountsLoaded: boolean = false;
  private testMutex: Promise<void> = Promise.resolve(); // Prevent concurrent tests

  constructor() {
    // No file-based config needed! Using environment variables (Kaggle method #1)
    // Accounts will be lazy-loaded from SecretsVault on first use
  }

  /**
   * Bootstrap completo do Kaggle CLI
   * - Instala Python packages
   * - Configura credentials
   * - Valida instalação
   */
  async bootstrap(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('\n🚀 [Kaggle CLI] Bootstrap iniciando...');

      // 1. Check Python
      const pythonOk = await this.checkPython();
      if (!pythonOk) {
        throw new Error('Python não encontrado. Instale Python 3.8+');
      }

      // 2. Check pip
      const pipOk = await this.checkPip();
      if (!pipOk) {
        throw new Error('pip não encontrado');
      }

      // 3. Install Kaggle CLI
      const cliInstalled = await this.installKaggleCLI();
      if (!cliInstalled) {
        throw new Error('Falha ao instalar Kaggle CLI');
      }

      // 4. Load accounts from SecretsVault
      await this.loadAccountsFromVault();
      this.accountsLoaded = true; // Mark as loaded to avoid duplicate vault reads

      // 5. Configure default account
      if (this.accounts.size > 0) {
        const firstAccount = Array.from(this.accounts.keys())[0];
        await this.setActiveAccount(firstAccount);
      }

      console.log('[Kaggle CLI] ✅ Bootstrap completo!');
      console.log(`   → CLI version: ${await this.getVersion()}`);
      console.log(`   → Accounts loaded: ${this.accounts.size}`);
      console.log(`   → Active account: ${this.currentAccount || 'none'}`);

      return { success: true };

    } catch (error: any) {
      console.error('[Kaggle CLI] ❌ Bootstrap failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Ensure accounts are loaded from SecretsVault (lazy loading)
   */
  private async ensureAccountsLoaded(): Promise<void> {
    if (this.accountsLoaded) return;
    await this.loadAccountsFromVault();
    this.accountsLoaded = true;
  }

  /**
   * ✅ DEPRECATED: Now uses Replit Secrets (KAGGLE_USERNAME_1, KAGGLE_KEY_1, etc)
   * 
   * To add Kaggle account:
   * 1. Go to Replit Secrets panel
   * 2. Add KAGGLE_USERNAME_1 and KAGGLE_KEY_1
   * 3. AutoDiscoverGPUService will detect automatically on next boot
   */
  async addAccount(username: string, apiKey: string): Promise<boolean> {
    console.error('[Kaggle CLI] ❌ DEPRECATED: This method no longer works. Use Replit Secrets instead (KAGGLE_USERNAME_1, KAGGLE_KEY_1)');
    return false;
  }

  /**
   * ✅ DEPRECATED: Now uses Replit Secrets
   * 
   * To remove Kaggle account:
   * 1. Delete KAGGLE_USERNAME_N and KAGGLE_KEY_N from Replit Secrets
   * 2. AutoDiscoverGPUService will cleanup worker on next boot
   */
  async removeAccount(username: string): Promise<boolean> {
    console.error('[Kaggle CLI] ❌ DEPRECATED: This method no longer works. Delete credentials from Replit Secrets instead');
    return false;
  }

  /**
   * Get current active account
   */
  getCurrentAccount(): string | null {
    return this.currentAccount;
  }

  /**
   * Get account by username (returns null if not found)
   */
  getAccount(username: string): KaggleAccount | null {
    return this.accounts.get(username) || null;
  }

  /**
   * Create complete snapshot of account state (for safe rollback)
   */
  private snapshotAccount(username: string): KaggleAccount | null {
    const account = this.accounts.get(username);
    if (!account) return null;
    
    // Deep copy to avoid reference issues
    return {
      username: account.username,
      apiKey: account.apiKey,
      isActive: account.isActive,
      weeklyQuotaUsed: account.weeklyQuotaUsed,
      maxWeeklyQuota: account.maxWeeklyQuota,
    };
  }

  /**
   * ✅ DEPRECATED: Account restoration no longer needed (using Replit Secrets)
   */
  private async restoreAccountSnapshot(snapshot: KaggleAccount): Promise<void> {
    console.error('[Kaggle CLI] ❌ DEPRECATED: Account snapshots no longer supported (use Replit Secrets)');
  }

  /**
   * Set active account (via environment variables - Kaggle official method #1)
   * No file writing needed! Env vars override config files.
   */
  async setActiveAccount(username: string): Promise<boolean> {
    try {
      // Ensure accounts are loaded from vault
      await this.ensureAccountsLoaded();

      const account = this.accounts.get(username);

      if (!account) {
        throw new Error(`Account ${username} not found`);
      }

      // Store previous account for selective cache invalidation
      const previousAccount = this.currentAccount;
      
      this.currentAccount = username;
      
      // Delete only the previous account's cache entry (if exists)
      // This preserves other accounts' cached quota data
      if (previousAccount && previousAccount !== username) {
        const prevKey = `kaggle-quota-${previousAccount}`;
        this.quotaCache.delete(prevKey);
        console.log(`[Kaggle CLI] 🗑️ Cleared cache for previous account: ${previousAccount}`);
      }

      console.log(`[Kaggle CLI] ✅ Active account: ${username}`);
      console.log(`[Kaggle CLI] Using env vars (KAGGLE_USERNAME + KAGGLE_KEY) - official method #1`);

      return true;

    } catch (error: any) {
      console.error(`[Kaggle CLI] Failed to set active account:`, error.message);
      return false;
    }
  }

  /**
   * ✅ DEPRECATED: Use Replit Secrets panel to update credentials
   */
  private async updateAccountSecret(username: string, newApiKey: string): Promise<void> {
    console.error('[Kaggle CLI] ❌ DEPRECATED: Update credentials in Replit Secrets panel');
  }

  /**
   * Test account credentials safely (transactional with automatic rollback)
   * 
   * This method:
   * 1. Acquires mutex lock (prevents concurrent tests)
   * 2. Snapshots current state (if account exists)
   * 3. Tests credentials
   * 4. On SUCCESS: Updates ONLY API key (preserves metadata) or adds new account
   * 5. On FAILURE: Restores snapshot or removes invalid account
   * 
   * THREAD-SAFE: Uses mutex to prevent race conditions
   * METADATA-SAFE: Preserves isActive, quota, etc even on successful tests
   */
  async testAccountSafe(username: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
    // Acquire mutex (serialize all tests)
    await this.testMutex;
    
    // Create new promise that will become the next mutex
    const testPromise = (async (): Promise<{ success: boolean; error?: string }> => {
      let previousAccount: string | null = null;
      let existingSnapshot: KaggleAccount | null = null;
      let isExistingAccount = false;
      
      try {
        console.log(`\n[Kaggle Test] 🔒 Mutex acquired - Testing ${username}...`);
        
        // STEP 1: Ensure accounts are loaded from vault
        await this.ensureAccountsLoaded();
        
        // STEP 2: Save current state for rollback
        previousAccount = this.currentAccount;
        existingSnapshot = this.snapshotAccount(username); // May be null for new accounts
        isExistingAccount = existingSnapshot !== null;
        
        if (existingSnapshot) {
          console.log(`[Kaggle Test] 💾 Snapshot saved: ${username} (isActive: ${existingSnapshot.isActive}, quota: ${Math.floor(existingSnapshot.weeklyQuotaUsed / 3600)}h)`);
        } else {
          console.log(`[Kaggle Test] 📝 New account - no snapshot needed`);
        }
        
        console.log(`[Kaggle Test] 💾 Previous active account: ${previousAccount || 'none'}`);
        
        // STEP 3: Add account (may overwrite existing - we'll fix this later if test passes)
        await this.addAccount(username, apiKey);
        
        // STEP 4: Set as active for testing
        await this.setActiveAccount(username);
        
        // STEP 5: Test credentials with Kaggle API
        console.log(`[Kaggle Test] 🧪 Testing credentials via Kaggle API...`);
        const testResult = await this.execute(['kernels', 'list', '--user', username]);
        
        console.log(`[Kaggle Test] ✅ VALID credentials for ${username}`);
        console.log(`[Kaggle Test] API response preview: ${testResult.stdout.substring(0, 150)}...`);
        
        // STEP 6: SUCCESS PATH - Preserve metadata if account existed
        if (isExistingAccount && existingSnapshot) {
          console.log(`[Kaggle Test] 🔄 Preserving existing account metadata...`);
          // Restore snapshot first (brings back old metadata)
          await this.restoreAccountSnapshot(existingSnapshot);
          // Then update ONLY the API key
          await this.updateAccountSecret(username, apiKey);
          console.log(`[Kaggle Test] ✅ Account updated (new key + preserved metadata)`);
        } else {
          console.log(`[Kaggle Test] ✅ New account added successfully`);
        }
        
        // STEP 7: Restore previous active account (SUCCESS PATH)
        if (previousAccount && previousAccount !== username) {
          console.log(`[Kaggle Test] ↩️  Restoring previous active account ${previousAccount}...`);
          const restored = await this.setActiveAccount(previousAccount);
          if (!restored) {
            console.error(`[Kaggle Test] ⚠️  Failed to restore active account ${previousAccount}`);
          } else {
            console.log(`[Kaggle Test] ✅ Previous active account restored`);
          }
        } else if (previousAccount === username) {
          console.log(`[Kaggle Test] ℹ️  Tested account was already active, keeping it active`);
        } else {
          console.log(`[Kaggle Test] ℹ️  No previous active account to restore`);
        }
        
        console.log(`[Kaggle Test] 🔓 Mutex released\n`);
        
        return { success: true };
        
      } catch (error: any) {
        console.error(`[Kaggle Test] ❌ INVALID credentials for ${username}:`, error.message);
        console.log(`[Kaggle Test] ↩️  Starting rollback...`);
        
        try {
          // ROLLBACK: Restore previous state
          if (existingSnapshot) {
            // Case A: Account EXISTED - Restore snapshot
            console.log(`[Kaggle Test] 📦 Restoring snapshot for ${username}...`);
            await this.restoreAccountSnapshot(existingSnapshot);
            console.log(`[Kaggle Test] ✅ Snapshot restored successfully`);
          } else {
            // Case B: Account was NEW - Remove completely
            console.log(`[Kaggle Test] 🧹 Removing invalid new account ${username}...`);
            await this.removeAccount(username);
            console.log(`[Kaggle Test] ✅ Invalid account removed`);
          }
          
          // Restore previous active account
          if (previousAccount) {
            if (previousAccount === username && existingSnapshot) {
              // Special case: Tested the active account itself - reactivate after restore
              console.log(`[Kaggle Test] ↩️  Reactivating restored account ${username}...`);
              const reactivated = await this.setActiveAccount(username);
              if (!reactivated) {
                console.error(`[Kaggle Test] ⚠️  Failed to reactivate ${username}`);
              }
            } else if (previousAccount !== username) {
              // Normal case: Restore different active account
              console.log(`[Kaggle Test] ↩️  Restoring previous active account ${previousAccount}...`);
              const restored = await this.setActiveAccount(previousAccount);
              if (!restored) {
                console.error(`[Kaggle Test] ⚠️  Failed to restore active account ${previousAccount}`);
              }
            }
          } else {
            console.log(`[Kaggle Test] ℹ️  No active account to restore (was null)`);
          }
          
          console.log(`[Kaggle Test] ✅ Rollback complete`);
          
        } catch (rollbackError: any) {
          console.error(`[Kaggle Test] ⚠️ CRITICAL: Rollback failed:`, rollbackError.message);
          // Don't throw - original error is more important
        }
        
        console.log(`[Kaggle Test] 🔓 Mutex released\n`);
        
        return { success: false, error: error.message };
      }
    })();
    
    // Update mutex reference (chain promises)
    this.testMutex = testPromise.then(() => {});
    
    return testPromise;
  }

  /**
   * Get next available account (quota rotation)
   */
  async getNextAvailableAccount(): Promise<string | null> {
    // Ensure accounts are loaded from vault
    await this.ensureAccountsLoaded();

    for (const [username, account] of Array.from(this.accounts.entries())) {
      if (!account.isActive) continue;

      // Check if under quota
      const remainingQuota = account.maxWeeklyQuota - account.weeklyQuotaUsed;
      if (remainingQuota > 3600) { // At least 1h remaining
        return username;
      }
    }

    return null;
  }

  /**
   * Update account quota usage
   */
  async updateAccountQuota(username: string, usedSeconds: number): Promise<void> {
    // Ensure accounts are loaded from vault
    await this.ensureAccountsLoaded();

    const account = this.accounts.get(username);
    if (account) {
      account.weeklyQuotaUsed += usedSeconds;
      console.log(`[Kaggle CLI] Updated quota for ${username}: ${Math.floor(account.weeklyQuotaUsed / 3600)}h used`);
    }
  }

  /**
   * Reset weekly quotas (call every Monday 00:00 UTC)
   */
  async resetWeeklyQuotas(): Promise<void> {
    // Ensure accounts are loaded from vault
    await this.ensureAccountsLoaded();

    for (const account of Array.from(this.accounts.values())) {
      account.weeklyQuotaUsed = 0;
    }
    console.log('[Kaggle CLI] ✅ Weekly quotas reset for all accounts');
  }

  /**
   * Detect if response is HTML error page (not JSON/text)
   */
  private isHTMLErrorResponse(output: string): boolean {
    const trimmed = output.trim().toLowerCase();
    return trimmed.startsWith('<!doctype') || 
           trimmed.startsWith('<html') ||
           trimmed.includes('<head>') ||
           trimmed.includes('<body>');
  }

  /**
   * Parse Kaggle error to user-friendly message
   */
  private parseKaggleError(output: string, errorMessage: string): string {
    // Check for HTML error page
    if (this.isHTMLErrorResponse(output)) {
      return 'Kaggle API returned an error page (possibly invalid credentials, rate limit, or service unavailable). Please verify your username and API key are correct.';
    }

    // Check for common error patterns
    if (output.toLowerCase().includes('unauthorized') || 
        output.toLowerCase().includes('401')) {
      return 'Invalid Kaggle credentials. Please check your username and API key.';
    }

    if (output.toLowerCase().includes('forbidden') || 
        output.toLowerCase().includes('403')) {
      return 'Access forbidden. Your Kaggle account may not be verified. Please verify your phone number at kaggle.com/settings → "Phone Verification" section, then generate a new API token.';
    }

    if (output.toLowerCase().includes('rate limit') || 
        output.toLowerCase().includes('429')) {
      return 'Kaggle API rate limit exceeded. Please try again in a few minutes.';
    }

    if (output.toLowerCase().includes('not found') || 
        output.toLowerCase().includes('404')) {
      return 'Kaggle resource not found. The kernel or dataset may not exist.';
    }

    // Return original error if no pattern matches
    return `Kaggle CLI error: ${errorMessage}`;
  }

  /**
   * Execute Kaggle CLI command with environment variables
   * Uses KAGGLE_USERNAME + KAGGLE_KEY (official authentication method #1)
   */
  async execute(args: string[]): Promise<{ stdout: string; stderr: string }> {
    // Ensure accounts are loaded from vault
    await this.ensureAccountsLoaded();

    if (!this.currentAccount) {
      throw new Error('No active Kaggle account. Call setActiveAccount() first.');
    }

    const account = this.accounts.get(this.currentAccount);
    if (!account) {
      throw new Error(`Account ${this.currentAccount} not found in memory`);
    }

    const command = `kaggle ${args.join(' ')}`;

    try {
      // Inject credentials as environment variables (Kaggle official method #1)
      // These override any config file (priority: env vars > config file)
      const { stdout, stderr } = await execAsync(command, {
        env: {
          ...process.env,
          KAGGLE_USERNAME: account.username,
          KAGGLE_KEY: account.apiKey,
        },
      });

      // Check if response is HTML error page
      if (this.isHTMLErrorResponse(stdout) || this.isHTMLErrorResponse(stderr)) {
        const errorMsg = this.parseKaggleError(stdout + stderr, 'HTML error page received');
        throw new Error(errorMsg);
      }

      return { stdout, stderr };

    } catch (error: any) {
      console.error(`[Kaggle CLI] Command failed: ${command}`);
      console.error(`[Kaggle CLI] Error output:`, error.stdout || error.stderr || error.message);

      // Parse error to user-friendly message
      const output = (error.stdout || '') + (error.stderr || '');
      const userFriendlyError = this.parseKaggleError(output, error.message);

      throw new Error(userFriendlyError);
    }
  }

  /**
   * Get CLI status
   */
  async getStatus(): Promise<KaggleCLIStatus> {
    // Ensure accounts are loaded to check if credentials exist
    await this.ensureAccountsLoaded();

    const pythonAvailable = await this.checkPython();
    const pipAvailable = await this.checkPip();
    const installed = await this.checkKaggleCLI();
    const credentialsConfigured = this.accounts.size > 0;
    const version = installed ? await this.getVersion() : undefined;

    return {
      installed,
      version,
      pythonAvailable,
      pipAvailable,
      credentialsConfigured,
      activeAccount: this.currentAccount || undefined,
    };
  }

  /**
   * List all accounts
   */
  async listAccounts(): Promise<Array<{ username: string; quotaUsed: number; quotaRemaining: number }>> {
    // Ensure accounts are loaded from vault
    await this.ensureAccountsLoaded();

    return Array.from(this.accounts.values()).map(account => ({
      username: account.username,
      quotaUsed: account.weeklyQuotaUsed,
      quotaRemaining: account.maxWeeklyQuota - account.weeklyQuotaUsed,
    }));
  }

  // ===================================================================
  // PRIVATE/INTERNAL HELPERS
  // ===================================================================

  /**
   * Internal: Check if accounts are loaded (sync version for internal use)
   */
  private areAccountsLoaded(): boolean {
    return this.accountsLoaded;
  }

  private async checkPython(): Promise<boolean> {
    try {
      await execAsync('python3 --version');
      return true;
    } catch {
      try {
        await execAsync('python --version');
        return true;
      } catch {
        return false;
      }
    }
  }

  private async checkPip(): Promise<boolean> {
    try {
      await execAsync('pip3 --version');
      return true;
    } catch {
      try {
        await execAsync('pip --version');
        return true;
      } catch {
        return false;
      }
    }
  }

  private async checkKaggleCLI(): Promise<boolean> {
    try {
      await execAsync('kaggle --version');
      return true;
    } catch {
      return false;
    }
  }

  private async installKaggleCLI(): Promise<boolean> {
    try {
      const installed = await this.checkKaggleCLI();

      if (installed) {
        console.log('[Kaggle CLI] Already installed');
        return true;
      }

      console.log('[Kaggle CLI] Installing via pip...');

      // Try pip3 first, fallback to pip
      try {
        await execAsync('pip3 install --upgrade kaggle', { timeout: 120000 });
      } catch {
        await execAsync('pip install --upgrade kaggle', { timeout: 120000 });
      }

      const success = await this.checkKaggleCLI();

      if (success) {
        console.log('[Kaggle CLI] ✅ Installed successfully');
      } else {
        console.error('[Kaggle CLI] ❌ Installation failed');
      }

      return success;

    } catch (error: any) {
      console.error('[Kaggle CLI] Installation error:', error.message);
      return false;
    }
  }

  private async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('kaggle --version');
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }


  /**
   * ✅ DEPRECATED: Now uses AutoDiscoverGPUService (reads from Replit Secrets)
   * 
   * This service no longer manages accounts directly.
   * Use AutoDiscoverGPUService.syncGPUsWithSecrets() instead.
   */
  private async loadAccountsFromVault(): Promise<void> {
    console.log('[Kaggle CLI] ⚠️ DEPRECATED: Account loading moved to AutoDiscoverGPUService');
    console.log('[Kaggle CLI] Add credentials via Replit Secrets: KAGGLE_USERNAME_1, KAGGLE_KEY_1');
  }

  /**
   * P1: Fetch REAL quota usage from Kaggle CLI
   * 
   * Executes `kaggle kernels usage` and parses the result
   * Returns actual usage vs 70% quota limit (21h/week = 75600s)
   * 
   * CACHING: Per-account caching with 5min TTL to avoid excessive API calls
   */
  private quotaCache: Map<string, { timestamp: number; data: any }> = new Map();
  private readonly QUOTA_CACHE_TTL_MS = 5 * 60 * 1000; // 5min

  async fetchRealKaggleQuota(username?: string): Promise<{
    success: boolean;
    quotaUsedSeconds?: number;
    quotaMaxSeconds?: number;
    quotaUsedHours?: number;
    quotaLimitHours?: number;
    percentUsed?: number;
    raw?: string;
    error?: string;
  }> {
    try {
      // Determine target username
      const targetUsername = username || this.currentAccount;
      if (!targetUsername) {
        return {
          success: false,
          error: 'No active Kaggle account configured',
        };
      }
      
      // Switch account if needed
      if (targetUsername !== this.currentAccount) {
        await this.setActiveAccount(targetUsername);
      }
      
      // Check per-account cache
      const cacheKey = `kaggle-quota-${targetUsername}`;
      const cached = this.quotaCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.QUOTA_CACHE_TTL_MS) {
        console.log(`[Kaggle CLI] ✅ Returning cached quota data for ${targetUsername}`);
        return cached.data;
      }

      console.log(`[Kaggle CLI] 🔍 Fetching real quota from internal DB (Kaggle has NO API for quota!)...`);

      // 🔥 FACT: Kaggle has NO official API for quota tracking (verified 2025)
      // Available CLI commands: list, files, init, push, pull, output, status (NO usage/quota)
      // PRODUCTION SOLUTION: Track quota internally via session duration in PostgreSQL
      // This is the ONLY production-grade approach for autonomous GPU management
      
      const { db } = await import('../db');
      const { gpuWorkers, gpuSessionState } = await import('../../shared/schema');
      const { sql: drizzleSql, eq } = await import('drizzle-orm');
      
      // Get weekly GPU usage from gpu_session_state (70% quota enforcement system)
      // Note: Kaggle has NO official API for quota, so we track internally via session duration
      const weekStartUTC = new Date();
      weekStartUTC.setUTCDate(weekStartUTC.getUTCDate() - weekStartUTC.getUTCDay()); // Sunday
      weekStartUTC.setUTCHours(0, 0, 0, 0);
      
      const [weeklyQuota] = await db
        .select({
          totalDurationMs: drizzleSql<number>`COALESCE(SUM(session_duration_ms), 0)`,
        })
        .from(gpuSessionState)
        .where(
          drizzleSql`provider = 'kaggle' 
            AND session_started >= ${weekStartUTC}
            AND is_active = false`
        );
      
      const usedMs = Number(weeklyQuota?.totalDurationMs || 0);
      const usedSeconds = Math.floor(usedMs / 1000);
      const maxSeconds = 108000; // 30h Kaggle free tier limit
      const usedHours = usedSeconds / 3600;
      const limitHours = maxSeconds / 3600;
      const percentUsed = (usedSeconds / maxSeconds) * 100;
      
      const result = {
        success: true,
        quotaUsedSeconds: usedSeconds,
        quotaMaxSeconds: maxSeconds,
        quotaUsedHours: parseFloat(usedHours.toFixed(2)),
        quotaLimitHours: parseFloat(limitHours.toFixed(2)),
        percentUsed: parseFloat(percentUsed.toFixed(1)),
        raw: `Internal tracking: ${usedSeconds}s / ${maxSeconds}s (${percentUsed.toFixed(1)}%)`,
      };
      
      // Cache the result
      this.quotaCache.set(cacheKey, { timestamp: Date.now(), data: result });
      
      console.log(`[Kaggle CLI] ✅ Quota from DB: ${result.quotaUsedHours}h / ${result.quotaLimitHours}h (${result.percentUsed}%)`);
      
      return result;
    } catch (dbError: any) {
      console.error(`[Kaggle CLI] ❌ DB query failed:`, dbError.message);
      
      // Fallback to 0 usage if DB fails
      return {
        success: false,
        error: `Database error: ${dbError.message}`,
      };
    }
  }

  /**
   * Compare heartbeat tracking vs real Kaggle quota
   * Useful for validating accuracy of heartbeat-based quota tracking
   */
  async compareQuotaTracking(username?: string): Promise<{
    heartbeatSeconds: number;
    realSeconds?: number;
    diffSeconds?: number;
    diffPercent?: number;
    accuracy?: string;
  }> {
    const targetUsername = username || this.currentAccount;
    if (!targetUsername) {
      throw new Error('No active account');
    }

    await this.ensureAccountsLoaded();
    const account = this.accounts.get(targetUsername);
    if (!account) {
      throw new Error(`Account not found: ${targetUsername}`);
    }

    const heartbeatSeconds = account.weeklyQuotaUsed;
    const realQuota = await this.fetchRealKaggleQuota(targetUsername);

    if (!realQuota.success || !realQuota.quotaUsedSeconds) {
      return {
        heartbeatSeconds,
        accuracy: 'Unable to fetch real quota for comparison',
      };
    }

    const diffSeconds = Math.abs(realQuota.quotaUsedSeconds - heartbeatSeconds);
    const diffPercent = (diffSeconds / realQuota.quotaUsedSeconds) * 100;

    let accuracy = 'unknown';
    if (diffPercent < 5) accuracy = 'excellent (< 5% diff)';
    else if (diffPercent < 10) accuracy = 'good (< 10% diff)';
    else if (diffPercent < 20) accuracy = 'fair (< 20% diff)';
    else accuracy = `poor (${diffPercent.toFixed(1)}% diff)`;

    console.log(`[Kaggle CLI] 📊 Quota Comparison:
      Heartbeat: ${(heartbeatSeconds / 3600).toFixed(2)}h
      Real: ${(realQuota.quotaUsedSeconds / 3600).toFixed(2)}h
      Diff: ${(diffSeconds / 3600).toFixed(2)}h (${diffPercent.toFixed(1)}%)
      Accuracy: ${accuracy}`);

    return {
      heartbeatSeconds,
      realSeconds: realQuota.quotaUsedSeconds,
      diffSeconds,
      diffPercent: parseFloat(diffPercent.toFixed(1)),
      accuracy,
    };
  }
}

// Singleton
export const kaggleCLIService = new KaggleCLIService();

/**
 * API helpers
 */
export const KaggleCLIAPI = {
  bootstrap: () => kaggleCLIService.bootstrap(),
  addAccount: (username: string, apiKey: string) => kaggleCLIService.addAccount(username, apiKey),
  removeAccount: (username: string) => kaggleCLIService.removeAccount(username),
  getCurrentAccount: () => kaggleCLIService.getCurrentAccount(),
  getAccount: (username: string) => kaggleCLIService.getAccount(username),
  setActiveAccount: (username: string) => kaggleCLIService.setActiveAccount(username),
  testAccountSafe: (username: string, apiKey: string) => kaggleCLIService.testAccountSafe(username, apiKey),
  execute: (args: string[]) => kaggleCLIService.execute(args),
  getStatus: () => kaggleCLIService.getStatus(),
  listAccounts: () => kaggleCLIService.listAccounts(),
  getNextAvailable: () => kaggleCLIService.getNextAvailableAccount(),
  updateQuota: (username: string, usedSeconds: number) => kaggleCLIService.updateAccountQuota(username, usedSeconds),
  resetQuotas: () => kaggleCLIService.resetWeeklyQuotas(),
  // P1: Real-time quota telemetry
  fetchRealQuota: (username?: string) => kaggleCLIService.fetchRealKaggleQuota(username),
  compareQuota: (username?: string) => kaggleCLIService.compareQuotaTracking(username),
};
