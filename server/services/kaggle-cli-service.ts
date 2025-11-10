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
import { secretsVault } from './security/secrets-vault';

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
   * Adicionar conta Kaggle (salva em SecretsVault)
   */
  async addAccount(username: string, apiKey: string): Promise<boolean> {
    try {
      // Save to SecretsVault
      await secretsVault.store(`kaggle-${username}`, apiKey, 365); // 1 ano

      // Add to memory
      this.accounts.set(username, {
        username,
        apiKey,
        isActive: true,
        weeklyQuotaUsed: 0,
        maxWeeklyQuota: 108000, // 30h
      });

      console.log(`[Kaggle CLI] ✅ Account added: ${username}`);

      // Set as active if first account
      if (this.accounts.size === 1) {
        await this.setActiveAccount(username);
      }

      return true;

    } catch (error: any) {
      console.error(`[Kaggle CLI] Failed to add account:`, error.message);
      return false;
    }
  }

  /**
   * Remove conta
   */
  async removeAccount(username: string): Promise<boolean> {
    try {
      // Remove from SecretsVault
      await secretsVault.delete(`kaggle-${username}`);

      // Remove from memory
      this.accounts.delete(username);

      console.log(`[Kaggle CLI] ✅ Account removed: ${username}`);

      // Switch to another account if this was active
      if (this.currentAccount === username) {
        const remaining = Array.from(this.accounts.keys());
        if (remaining.length > 0) {
          await this.setActiveAccount(remaining[0]);
        } else {
          this.currentAccount = null;
        }
      }

      return true;

    } catch (error: any) {
      console.error(`[Kaggle CLI] Failed to remove account:`, error.message);
      return false;
    }
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
   * Restore account from snapshot (preserves all metadata)
   */
  private async restoreAccountSnapshot(snapshot: KaggleAccount): Promise<void> {
    // Save to SecretsVault
    await secretsVault.store(`kaggle-${snapshot.username}`, snapshot.apiKey, 365);
    
    // Restore to memory with ALL metadata preserved
    this.accounts.set(snapshot.username, {
      username: snapshot.username,
      apiKey: snapshot.apiKey,
      isActive: snapshot.isActive,
      weeklyQuotaUsed: snapshot.weeklyQuotaUsed,
      maxWeeklyQuota: snapshot.maxWeeklyQuota,
    });
    
    console.log(`[Kaggle CLI] ✅ Account snapshot restored: ${snapshot.username} (isActive: ${snapshot.isActive}, quota: ${Math.floor(snapshot.weeklyQuotaUsed / 3600)}h used)`);
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

      this.currentAccount = username;

      console.log(`[Kaggle CLI] ✅ Active account: ${username}`);
      console.log(`[Kaggle CLI] Using env vars (KAGGLE_USERNAME + KAGGLE_KEY) - official method #1`);

      return true;

    } catch (error: any) {
      console.error(`[Kaggle CLI] Failed to set active account:`, error.message);
      return false;
    }
  }

  /**
   * Update ONLY the API key without touching metadata (for credential updates)
   */
  private async updateAccountSecret(username: string, newApiKey: string): Promise<void> {
    // Update SecretsVault
    await secretsVault.store(`kaggle-${username}`, newApiKey, 365);
    
    // Update ONLY apiKey in memory, preserve all other fields
    const account = this.accounts.get(username);
    if (account) {
      account.apiKey = newApiKey;
      console.log(`[Kaggle CLI] ✅ API key updated for ${username} (metadata preserved)`);
    }
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


  private async loadAccountsFromVault(): Promise<void> {
    try {
      // List all secrets starting with "kaggle-"
      const allSecrets = await secretsVault.list();
      const kaggleSecrets = allSecrets.filter((s: any) => s.name.startsWith('kaggle-'));

      for (const secret of kaggleSecrets) {
        const username = secret.name.replace('kaggle-', '');
        const apiKey = await secretsVault.retrieve(secret.name);

        if (apiKey) {
          this.accounts.set(username, {
            username,
            apiKey,
            isActive: true,
            weeklyQuotaUsed: 0,
            maxWeeklyQuota: 108000,
          });
        }
      }

      console.log(`[Kaggle CLI] ✅ Loaded ${this.accounts.size} accounts from vault`);

    } catch (error: any) {
      console.error('[Kaggle CLI] Failed to load accounts:', error.message);
    }
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
};
