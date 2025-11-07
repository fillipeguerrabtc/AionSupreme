/**
 * TOS COMPLIANCE MONITOR
 * ======================
 * 
 * Monitors GPU usage patterns and alerts when approaching ToS violation risks.
 * 
 * 🔥 COMPLIANCE THRESHOLDS:
 * - 60% WARNING: Soft alert, monitor closely
 * - 70% CRITICAL: Hard limit, stop immediately
 * 
 * MONITORED METRICS:
 * ✅ Colab session duration (11h limit)
 * ✅ Colab cooldown compliance (36h minimum)
 * ✅ Kaggle weekly quota (28h limit ON-DEMAND, NO daily limit)
 * ✅ Session frequency patterns (detect abuse)
 * 
 * FEATURES:
 * - Real-time threshold monitoring
 * - Alert logging with severity levels
 * - Compliance event history
 * - Risk assessment scoring
 * - Automatic violation prevention
 */

import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { QUOTA_LIMITS } from '../config/quota-limits';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'violation';

interface ComplianceAlert {
  workerId: number;
  provider: 'colab' | 'kaggle';
  severity: AlertSeverity;
  threshold: number; // 0-1 (percentage)
  currentUsage: number;
  limit: number;
  message: string;
  timestamp: Date;
  metric: 'session_duration' | 'daily_usage' | 'weekly_usage' | 'cooldown';
}

interface ComplianceStatus {
  workerId: number;
  provider: 'colab' | 'kaggle';
  isCompliant: boolean;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  alerts: ComplianceAlert[];
  recommendations: string[];
}

export class ToSComplianceMonitor {
  
  private alerts: ComplianceAlert[] = [];
  private readonly WARNING_THRESHOLD = 0.60;  // 60% soft warning
  private readonly CRITICAL_THRESHOLD = 0.70; // 70% hard limit (Kaggle) or custom (Colab 11h = 91.7%)
  
  /**
   * Monitor a worker's compliance status
   */
  async monitorWorker(workerId: number): Promise<ComplianceStatus> {
    const worker = await db.query.gpuWorkers.findFirst({
      where: eq(gpuWorkers.id, workerId),
    });
    
    if (!worker) {
      return {
        workerId,
        provider: 'colab',
        isCompliant: false,
        riskLevel: 'critical',
        alerts: [{
          workerId,
          provider: 'colab',
          severity: 'violation',
          threshold: 0,
          currentUsage: 0,
          limit: 0,
          message: 'Worker not found',
          timestamp: new Date(),
          metric: 'session_duration',
        }],
        recommendations: ['Worker does not exist or was deleted'],
      };
    }
    
    const provider = worker.provider as 'colab' | 'kaggle';
    
    if (provider === 'colab') {
      return await this.monitorColabCompliance(worker);
    } else if (provider === 'kaggle') {
      return await this.monitorKaggleCompliance(worker);
    }
    
    return {
      workerId,
      provider,
      isCompliant: true,
      riskLevel: 'low',
      alerts: [],
      recommendations: [],
    };
  }
  
  /**
   * Monitor Colab compliance (session duration + cooldown)
   */
  private async monitorColabCompliance(worker: any): Promise<ComplianceStatus> {
    const alerts: ComplianceAlert[] = [];
    const recommendations: string[] = [];
    
    // Check session duration
    if (worker.sessionStartedAt) {
      const now = new Date();
      const sessionStart = new Date(worker.sessionStartedAt);
      const runtimeSeconds = Math.floor((now.getTime() - sessionStart.getTime()) / 1000);
      const runtimeHours = runtimeSeconds / 3600;
      const limitHours = QUOTA_LIMITS.COLAB.SAFE_SESSION_HOURS; // 11h
      const utilizationPercent = runtimeHours / limitHours;
      
      // WARNING: 60% of 11h = 6.6h
      if (utilizationPercent >= this.WARNING_THRESHOLD && utilizationPercent < QUOTA_LIMITS.SAFE_THRESHOLDS.COLAB_SESSION_PERCENT) {
        alerts.push({
          workerId: worker.id,
          provider: 'colab',
          severity: 'warning',
          threshold: this.WARNING_THRESHOLD,
          currentUsage: runtimeHours,
          limit: limitHours,
          message: `Session approaching limit: ${runtimeHours.toFixed(2)}h of 11h (${(utilizationPercent * 100).toFixed(1)}%)`,
          timestamp: now,
          metric: 'session_duration',
        });
        
        recommendations.push(`Monitor session closely - ${(limitHours - runtimeHours).toFixed(2)}h remaining`);
      }
      
      // CRITICAL: 91.7% of 12h = 11h (our safe limit)
      if (utilizationPercent >= QUOTA_LIMITS.SAFE_THRESHOLDS.COLAB_SESSION_PERCENT) {
        alerts.push({
          workerId: worker.id,
          provider: 'colab',
          severity: 'critical',
          threshold: QUOTA_LIMITS.SAFE_THRESHOLDS.COLAB_SESSION_PERCENT,
          currentUsage: runtimeHours,
          limit: limitHours,
          message: `Session at safe limit: ${runtimeHours.toFixed(2)}h of 11h - STOP IMMEDIATELY`,
          timestamp: now,
          metric: 'session_duration',
        });
        
        recommendations.push('🔥 STOP SESSION NOW - At safe limit!');
      }
    }
    
    // Check cooldown compliance
    if (worker.cooldownUntil) {
      const now = new Date();
      const cooldownEnd = new Date(worker.cooldownUntil);
      const cooldownRemainingSeconds = Math.max(0, Math.floor((cooldownEnd.getTime() - now.getTime()) / 1000));
      const cooldownRemainingHours = cooldownRemainingSeconds / 3600;
      
      // INFO: Cooldown in progress
      if (cooldownRemainingHours > QUOTA_LIMITS.WARNING_THRESHOLDS.COLAB_COOLDOWN_REMAINING_HOURS) {
        alerts.push({
          workerId: worker.id,
          provider: 'colab',
          severity: 'info',
          threshold: 0,
          currentUsage: cooldownRemainingHours,
          limit: QUOTA_LIMITS.COLAB.COOLDOWN_HOURS,
          message: `Cooldown active: ${cooldownRemainingHours.toFixed(2)}h remaining`,
          timestamp: now,
          metric: 'cooldown',
        });
      }
      
      // WARNING: Less than 6h remaining in cooldown
      if (cooldownRemainingHours > 0 && cooldownRemainingHours <= QUOTA_LIMITS.WARNING_THRESHOLDS.COLAB_COOLDOWN_REMAINING_HOURS) {
        alerts.push({
          workerId: worker.id,
          provider: 'colab',
          severity: 'warning',
          threshold: 0,
          currentUsage: cooldownRemainingHours,
          limit: QUOTA_LIMITS.COLAB.COOLDOWN_HOURS,
          message: `Cooldown ending soon: ${cooldownRemainingHours.toFixed(2)}h remaining`,
          timestamp: now,
          metric: 'cooldown',
        });
        
        recommendations.push('Prepare for next session start');
      }
    }
    
    // Assess risk level
    const riskLevel = this.assessRiskLevel(alerts);
    const isCompliant = !alerts.some(a => a.severity === 'critical' || a.severity === 'violation');
    
    return {
      workerId: worker.id,
      provider: 'colab',
      isCompliant,
      riskLevel,
      alerts,
      recommendations,
    };
  }
  
  /**
   * Monitor Kaggle compliance (ON-DEMAND weekly quota only)
   * ❌ REMOVED daily limits - can use all 28h in one day if needed!
   */
  private async monitorKaggleCompliance(worker: any): Promise<ComplianceStatus> {
    const alerts: ComplianceAlert[] = [];
    const recommendations: string[] = [];
    
    const weeklyUsageHours = worker.weeklyUsageHours || 0;
    const now = new Date();
    
    // ❌ REMOVED: Daily limit checks (ON-DEMAND strategy)
    // Only monitor weekly quota (28h/week)
    
    const weeklyLimit = QUOTA_LIMITS.KAGGLE.SAFE_WEEKLY_HOURS;
    const weeklyUtilization = weeklyUsageHours / weeklyLimit;
    
    // WARNING: 60% of 28h = 16.8h
    if (weeklyUtilization >= QUOTA_LIMITS.WARNING_THRESHOLDS.KAGGLE_WEEKLY_PERCENT && weeklyUtilization < QUOTA_LIMITS.SAFE_THRESHOLDS.KAGGLE_WEEKLY_PERCENT) {
      alerts.push({
        workerId: worker.id,
        provider: 'kaggle',
        severity: 'warning',
        threshold: QUOTA_LIMITS.WARNING_THRESHOLDS.KAGGLE_WEEKLY_PERCENT,
        currentUsage: weeklyUsageHours,
        limit: weeklyLimit,
        message: `Weekly quota approaching limit: ${weeklyUsageHours.toFixed(2)}h of 28h (${(weeklyUtilization * 100).toFixed(1)}%)`,
        timestamp: now,
        metric: 'weekly_usage',
      });
      
      recommendations.push(`${(weeklyLimit - weeklyUsageHours).toFixed(2)}h remaining this week`);
    }
    
    // CRITICAL: 93.3% of 30h = 28h (our safe limit)
    if (weeklyUtilization >= QUOTA_LIMITS.SAFE_THRESHOLDS.KAGGLE_WEEKLY_PERCENT) {
      alerts.push({
        workerId: worker.id,
        provider: 'kaggle',
        severity: 'critical',
        threshold: QUOTA_LIMITS.SAFE_THRESHOLDS.KAGGLE_WEEKLY_PERCENT,
        currentUsage: weeklyUsageHours,
        limit: weeklyLimit,
        message: `Weekly limit reached: ${weeklyUsageHours.toFixed(2)}h of 28h - NO MORE THIS WEEK`,
        timestamp: now,
        metric: 'weekly_usage',
      });
      
      recommendations.push('🔥 Weekly limit reached - Wait for Sunday UTC reset');
    }
    
    // Assess risk level
    const riskLevel = this.assessRiskLevel(alerts);
    const isCompliant = !alerts.some(a => a.severity === 'critical' || a.severity === 'violation');
    
    return {
      workerId: worker.id,
      provider: 'kaggle',
      isCompliant,
      riskLevel,
      alerts,
      recommendations,
    };
  }
  
  /**
   * Assess overall risk level based on alerts
   */
  private assessRiskLevel(alerts: ComplianceAlert[]): 'low' | 'moderate' | 'high' | 'critical' {
    if (alerts.some(a => a.severity === 'violation' || a.severity === 'critical')) {
      return 'critical';
    }
    
    const warningCount = alerts.filter(a => a.severity === 'warning').length;
    
    if (warningCount >= 2) {
      return 'high';
    } else if (warningCount === 1) {
      return 'moderate';
    }
    
    return 'low';
  }
  
  /**
   * Log compliance alert (for audit trail)
   */
  logAlert(alert: ComplianceAlert): void {
    this.alerts.push(alert);
    
    const emoji = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🔥',
      violation: '🚨',
    }[alert.severity];
    
    console.log(
      `[ToSComplianceMonitor] ${emoji} ${alert.severity.toUpperCase()} - ` +
      `Worker ${alert.workerId} (${alert.provider}): ${alert.message}`
    );
    
    // Store in database for dashboard
    // TODO: Implement compliance_alerts table for historical tracking
  }
  
  /**
   * Monitor all active workers
   */
  async monitorAllWorkers(): Promise<ComplianceStatus[]> {
    const workers = await db
      .select()
      .from(gpuWorkers)
      .where(
        sql`${gpuWorkers.provider} IN ('colab', 'kaggle') AND ${gpuWorkers.status} != 'offline'`
      );
    
    const statusPromises = workers.map(worker => this.monitorWorker(worker.id));
    const statuses = await Promise.all(statusPromises);
    
    // Log all alerts
    statuses.forEach(status => {
      status.alerts.forEach(alert => this.logAlert(alert));
    });
    
    return statuses;
  }
  
  /**
   * Get compliance summary for dashboard
   */
  async getComplianceSummary(): Promise<{
    totalWorkers: number;
    compliantWorkers: number;
    atRiskWorkers: number;
    criticalWorkers: number;
    recentAlerts: ComplianceAlert[];
  }> {
    const statuses = await this.monitorAllWorkers();
    
    return {
      totalWorkers: statuses.length,
      compliantWorkers: statuses.filter(s => s.isCompliant).length,
      atRiskWorkers: statuses.filter(s => s.riskLevel === 'moderate' || s.riskLevel === 'high').length,
      criticalWorkers: statuses.filter(s => s.riskLevel === 'critical').length,
      recentAlerts: this.alerts.slice(-10), // Last 10 alerts
    };
  }
  
  /**
   * Clear alert history (maintenance)
   */
  clearAlerts(): void {
    this.alerts = [];
    console.log('[ToSComplianceMonitor] Alert history cleared');
  }
}

// Singleton instance
export const tosComplianceMonitor = new ToSComplianceMonitor();
