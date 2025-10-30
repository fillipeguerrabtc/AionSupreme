/**
 * Multi-Cloud Synchronization & Failover System
 * 
 * Architecture:
 * - Both GCP Cloud Run and AWS Fargate connect to the same Neon PostgreSQL database
 * - No database replication needed (Neon handles HA automatically)
 * - Health monitoring checks both clouds and routes traffic to healthy instance
 * - Automatic failover if primary cloud becomes unhealthy
 */

import axios from 'axios';

interface CloudEndpoint {
  name: string;
  url: string;
  isPrimary: boolean;
  isHealthy: boolean;
  lastCheck?: Date;
  consecutiveFailures: number;
}

export class MultiCloudSync {
  private endpoints: CloudEndpoint[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30000; // 30 seconds
  private readonly MAX_FAILURES = 3; // Failover after 3 consecutive failures
  private readonly HEALTH_TIMEOUT_MS = 5000; // 5 second timeout

  constructor() {
    this.initializeEndpoints();
  }

  private initializeEndpoints() {
    // GCP Cloud Run endpoint
    const gcpUrl = process.env.GCP_ENDPOINT;
    if (gcpUrl) {
      this.endpoints.push({
        name: 'GCP Cloud Run',
        url: gcpUrl,
        isPrimary: true, // GCP is primary by default
        isHealthy: false,
        consecutiveFailures: 0,
      });
    }

    // AWS Fargate endpoint
    const awsUrl = process.env.AWS_ENDPOINT;
    if (awsUrl) {
      this.endpoints.push({
        name: 'AWS Fargate',
        url: awsUrl,
        isPrimary: false, // AWS is backup
        isHealthy: false,
        consecutiveFailures: 0,
      });
    }

    console.log(`[Multi-Cloud] Initialized with ${this.endpoints.length} endpoints`);
  }

  /**
   * Start health monitoring
   */
  startMonitoring() {
    if (this.healthCheckInterval) {
      console.warn('[Multi-Cloud] Monitoring already started');
      return;
    }

    console.log(`[Multi-Cloud] Starting health monitoring (interval: ${this.CHECK_INTERVAL_MS}ms)`);

    // Initial check
    this.performHealthChecks();

    // Periodic checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('[Multi-Cloud] Monitoring stopped');
    }
  }

  /**
   * Perform health checks on all endpoints
   */
  private async performHealthChecks() {
    const checks = this.endpoints.map(endpoint => this.checkEndpointHealth(endpoint));
    await Promise.all(checks);

    // Check if we need to failover
    this.evaluateFailover();

    // Log status
    this.logStatus();
  }

  /**
   * Check health of a single endpoint
   */
  private async checkEndpointHealth(endpoint: CloudEndpoint): Promise<void> {
    try {
      const response = await axios.get(`${endpoint.url}/health`, {
        timeout: this.HEALTH_TIMEOUT_MS,
        validateStatus: (status) => status === 200,
      });

      if (response.data.status === 'healthy') {
        endpoint.isHealthy = true;
        endpoint.consecutiveFailures = 0;
        endpoint.lastCheck = new Date();
        console.log(`[Multi-Cloud] ✓ ${endpoint.name} is healthy`);
      } else {
        throw new Error(`Unhealthy status: ${response.data.status}`);
      }
    } catch (error: any) {
      endpoint.isHealthy = false;
      endpoint.consecutiveFailures++;
      endpoint.lastCheck = new Date();
      console.error(`[Multi-Cloud] ✗ ${endpoint.name} check failed: ${error.message}`);
    }
  }

  /**
   * Evaluate if failover is needed
   */
  private evaluateFailover() {
    const primary = this.endpoints.find(e => e.isPrimary);
    const backup = this.endpoints.find(e => !e.isPrimary);

    if (!primary || !backup) {
      console.warn('[Multi-Cloud] Cannot evaluate failover - missing endpoints');
      return;
    }

    // Check if primary has failed threshold
    if (primary.consecutiveFailures >= this.MAX_FAILURES && backup.isHealthy) {
      console.warn(`[Multi-Cloud] 🔄 FAILOVER: ${primary.name} → ${backup.name}`);
      
      // Swap primary/backup
      primary.isPrimary = false;
      backup.isPrimary = true;

      // Reset failure counters
      primary.consecutiveFailures = 0;
      backup.consecutiveFailures = 0;

      // Notify (could send webhook, email, etc.)
      this.notifyFailover(primary.name, backup.name);
    }
  }

  /**
   * Get current active endpoint
   */
  getActiveEndpoint(): CloudEndpoint | null {
    // First try primary
    const primary = this.endpoints.find(e => e.isPrimary && e.isHealthy);
    if (primary) return primary;

    // Fallback to any healthy endpoint
    const healthy = this.endpoints.find(e => e.isHealthy);
    if (healthy) {
      console.warn(`[Multi-Cloud] Primary unhealthy, using ${healthy.name}`);
      return healthy;
    }

    console.error('[Multi-Cloud] No healthy endpoints available!');
    return null;
  }

  /**
   * Get status of all endpoints
   */
  getStatus() {
    return {
      endpoints: this.endpoints.map(e => ({
        name: e.name,
        url: e.url,
        isPrimary: e.isPrimary,
        isHealthy: e.isHealthy,
        lastCheck: e.lastCheck,
        consecutiveFailures: e.consecutiveFailures,
      })),
      activeEndpoint: this.getActiveEndpoint()?.name || 'none',
    };
  }

  /**
   * Log current status
   */
  private logStatus() {
    const active = this.getActiveEndpoint();
    const summary = this.endpoints.map(e => {
      const status = e.isHealthy ? '✓' : '✗';
      const primary = e.isPrimary ? '[PRIMARY]' : '[BACKUP]';
      return `${status} ${e.name} ${primary}`;
    }).join(' | ');

    console.log(`[Multi-Cloud] Status: ${summary} | Active: ${active?.name || 'NONE'}`);
  }

  /**
   * Notify about failover (can be extended with webhooks, emails, etc.)
   */
  private notifyFailover(from: string, to: string) {
    console.warn(`[Multi-Cloud] ⚠️  FAILOVER OCCURRED: ${from} → ${to}`);
    
    // TODO: Send webhook notification
    // TODO: Send email/Slack alert
    // TODO: Update DNS record (if using managed DNS)
  }

  /**
   * Proxy request to active endpoint
   */
  async proxyRequest(path: string, options: any = {}): Promise<any> {
    const endpoint = this.getActiveEndpoint();
    
    if (!endpoint) {
      throw new Error('No healthy cloud endpoints available');
    }

    const url = `${endpoint.url}${path}`;
    
    try {
      const response = await axios({
        ...options,
        url,
        timeout: options.timeout || 30000,
      });
      
      return response.data;
    } catch (error: any) {
      console.error(`[Multi-Cloud] Request to ${endpoint.name} failed:`, error.message);
      
      // Try backup if primary failed
      if (endpoint.isPrimary) {
        const backup = this.endpoints.find(e => !e.isPrimary && e.isHealthy);
        if (backup) {
          console.log(`[Multi-Cloud] Retrying with backup: ${backup.name}`);
          const backupUrl = `${backup.url}${path}`;
          const response = await axios({ ...options, url: backupUrl });
          return response.data;
        }
      }
      
      throw error;
    }
  }
}

// Singleton instance
export const multiCloudSync = new MultiCloudSync();

// Start monitoring if running in production
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_MULTI_CLOUD === 'true') {
  multiCloudSync.startMonitoring();
  console.log('[Multi-Cloud] Auto-started monitoring in production mode');
}
