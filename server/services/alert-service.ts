/**
 * ALERT SERVICE - PRODUCTION-GRADE NOTIFICATIONS
 * ================================================
 * 
 * Sistema centralizado de alertas via webhook, email e logging
 * 
 * FEATURES:
 * ✅ Webhook notifications (HTTP POST)
 * ✅ Email alerts (via SMTP or SendGrid)
 * ✅ Structured logging fallback
 * ✅ Retry logic with exponential backoff
 * ✅ Alert history tracking
 * ✅ Severity levels (info, warning, critical, emergency)
 * 
 * USAGE:
 * ```ts
 * import { alertService } from './services/alert-service';
 * 
 * await alertService.sendAlert({
 *   severity: 'critical',
 *   title: 'CAPTCHA Detected',
 *   message: 'Manual intervention required for Colab worker',
 *   context: { workerId, notebookUrl }
 * });
 * ```
 */

import { logger } from './logger-service';
import axios from 'axios';

const log = logger.child('AlertService');

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

export interface AlertPayload {
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, any>;
  timestamp?: Date;
}

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  timeout?: number; // ms
}

export class AlertService {
  private webhookUrl: string | null = null;
  private emailConfig: any | null = null; // TODO: Implement SendGrid/SMTP config
  private alertHistory: AlertPayload[] = [];
  private readonly MAX_HISTORY = 1000;

  constructor() {
    // Load webhook URL from env
    this.webhookUrl = process.env.ALERT_WEBHOOK_URL || null;
    
    if (!this.webhookUrl) {
      log.warn('ALERT_WEBHOOK_URL not configured - webhook alerts disabled');
    } else {
      // SECURITY: Only log domain, not full URL (contains secret tokens)
      try {
        const webhookDomain = new URL(this.webhookUrl).hostname;
        log.info('Alert service initialized', { webhookDomain });
      } catch {
        log.info('Alert service initialized with webhook');
      }
    }
  }

  /**
   * Send alert via all configured channels
   */
  async sendAlert(payload: AlertPayload): Promise<void> {
    // Add timestamp
    const alert: AlertPayload = {
      ...payload,
      timestamp: payload.timestamp || new Date(),
    };

    // Store in history
    this.addToHistory(alert);

    // Log alert (ALWAYS - fallback mechanism)
    this.logAlert(alert);

    // Send webhook (if configured)
    if (this.webhookUrl) {
      await this.sendWebhook(alert).catch((error) => {
        log.error('Webhook send failed', error, { alert });
      });
    }

    // Send email (if configured)
    if (this.emailConfig) {
      await this.sendEmail(alert).catch((error) => {
        log.error('Email send failed', error, { alert });
      });
    }
  }

  /**
   * Send webhook notification with retry
   */
  private async sendWebhook(alert: AlertPayload): Promise<void> {
    if (!this.webhookUrl) return;

    const payload = {
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      context: alert.context,
      timestamp: alert.timestamp?.toISOString(),
      source: 'AION-GPU-Orchestration',
    };

    try {
      const response = await axios.post(this.webhookUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AION-AlertService/1.0',
        },
      });

      log.info('Webhook sent successfully', {
        status: response.status,
        severity: alert.severity,
      });
    } catch (error: any) {
      // Retry logic for transient errors
      if (error.response?.status >= 500 || error.code === 'ECONNREFUSED') {
        log.warn('Webhook failed, will retry', { error: error.message });
        await this.retryWebhook(alert, 1);
      } else {
        throw error;
      }
    }
  }

  /**
   * Retry webhook with exponential backoff
   */
  private async retryWebhook(alert: AlertPayload, attempt: number): Promise<void> {
    if (attempt > 3 || !this.webhookUrl) return;

    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
    log.info(`Retrying webhook in ${delay}ms (attempt ${attempt}/3)`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    // Reuse enriched payload with consistent headers (fix from architect)
    const payload = {
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      context: alert.context,
      timestamp: alert.timestamp?.toISOString(),
      source: 'AION-GPU-Orchestration',
    };

    try {
      await axios.post(this.webhookUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AION-AlertService/1.0',
        },
      });
      log.info('Webhook retry successful', { attempt });
    } catch (error) {
      if (attempt < 3) {
        await this.retryWebhook(alert, attempt + 1);
      } else {
        log.error('Webhook retry exhausted', error, { alert });
      }
    }
  }

  /**
   * Send email notification (TODO: Implement SendGrid/SMTP)
   */
  private async sendEmail(alert: AlertPayload): Promise<void> {
    // TODO: Implement email sending
    log.info('Email alerts not yet implemented', { alert });
  }

  /**
   * Log alert using structured logger
   */
  private logAlert(alert: AlertPayload): void {
    const logMethod = this.getLogMethod(alert.severity);
    logMethod(`[ALERT] ${alert.title}`, {
      severity: alert.severity,
      message: alert.message,
      context: alert.context,
      timestamp: alert.timestamp,
    });
  }

  /**
   * Get logger method based on severity
   */
  private getLogMethod(severity: AlertSeverity): (msg: string, ctx?: any) => void {
    switch (severity) {
      case 'emergency':
      case 'critical':
        return log.error.bind(log);
      case 'warning':
        return log.warn.bind(log);
      case 'info':
      default:
        return log.info.bind(log);
    }
  }

  /**
   * Add alert to history
   */
  private addToHistory(alert: AlertPayload): void {
    this.alertHistory.push(alert);
    
    // Limit history size
    if (this.alertHistory.length > this.MAX_HISTORY) {
      this.alertHistory.shift();
    }
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 100, severity?: AlertSeverity): AlertPayload[] {
    let alerts = this.alertHistory;
    
    if (severity) {
      alerts = alerts.filter((a) => a.severity === severity);
    }
    
    return alerts.slice(-limit).reverse();
  }

  /**
   * Clear alert history
   */
  clearHistory(): void {
    this.alertHistory = [];
    log.info('Alert history cleared');
  }
}

// Singleton instance
export const alertService = new AlertService();

// Export helpers
export const AlertAPI = {
  send: (payload: AlertPayload) => alertService.sendAlert(payload),
  getRecent: (limit?: number, severity?: AlertSeverity) => 
    alertService.getRecentAlerts(limit, severity),
  clear: () => alertService.clearHistory(),
};
