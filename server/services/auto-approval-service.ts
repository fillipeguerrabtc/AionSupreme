/**
 * AUTO-APPROVAL SERVICE - Configuration-driven automatic curation approval
 * 
 * Replaces hardcoded thresholds with DB-persisted configuration.
 * Implements namespace filtering and content flag detection.
 * 
 * Integration: curationStore.runAutoAnalysis() uses this service
 */

import { db } from "../db";
import { autoApprovalConfig, type AutoApprovalConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface AutoApprovalDecision {
  action: "approve" | "reject" | "review";
  reason: string;
  configUsed: {
    enabled: boolean;
    minApprovalScore: number;
    maxRejectScore: number;
    sensitiveFlags: string[];
    enabledNamespaces: string[];
  };
}

export class AutoApprovalService {
  private cachedConfig: AutoApprovalConfig | null = null;
  private lastConfigFetch: number = 0;
  private configCacheTTL = 60000; // 1 minute cache

  /**
   * Get auto-approval configuration (with caching)
   * Defaults to ID=1 config row
   */
  async getConfig(): Promise<AutoApprovalConfig> {
    const now = Date.now();

    // Return cached config if valid
    if (this.cachedConfig && (now - this.lastConfigFetch < this.configCacheTTL)) {
      return this.cachedConfig;
    }

    try {
      // Load config from DB (ID=1 is the system-wide config)
      const [config] = await db
        .select()
        .from(autoApprovalConfig)
        .where(eq(autoApprovalConfig.id, 1))
        .limit(1);

      if (!config) {
        // If no config exists, seed default config
        console.log(`[AutoApproval] ⚠️ No config found, seeding defaults...`);
        const [seeded] = await db
          .insert(autoApprovalConfig)
          .values({
            enabled: true,
            minApprovalScore: 80,
            maxRejectScore: 50,
            sensitiveFlags: ['adult', 'violence', 'medical', 'financial', 'pii'],
            enabledNamespaces: ['*'],
            autoRejectEnabled: true,
            requireAllQualityGates: false,
          } as any)
          .returning();

        this.cachedConfig = seeded;
        this.lastConfigFetch = now;
        console.log(`[AutoApproval] ✅ Default config seeded (ID: ${seeded.id})`);
        return seeded;
      }

      // Cache and return
      this.cachedConfig = config;
      this.lastConfigFetch = now;
      return config;
    } catch (error: any) {
      console.error(`[AutoApproval] ❌ Error fetching config:`, error.message);
      
      // Fallback to safe defaults if DB read fails
      return {
        id: 0,
        enabled: true,
        minApprovalScore: 80,
        maxRejectScore: 50,
        sensitiveFlags: ['adult', 'violence', 'medical', 'financial', 'pii'],
        enabledNamespaces: ['*'],
        autoRejectEnabled: true,
        requireAllQualityGates: false,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }

  /**
   * Force refresh config cache (call after admin updates)
   */
  refreshCache(): void {
    this.cachedConfig = null;
    this.lastConfigFetch = 0;
  }

  /**
   * Check if auto-approval should apply to this namespace
   */
  isNamespaceEnabled(namespace: string, config: AutoApprovalConfig): boolean {
    // If enabled namespaces is ["*"], allow all
    if (config.enabledNamespaces.includes('*')) {
      return true;
    }

    // Otherwise, check if namespace is in the list
    return config.enabledNamespaces.includes(namespace);
  }

  /**
   * Check if content has sensitive flags that require HITL
   */
  hasSensitiveContent(contentFlags: string[], config: AutoApprovalConfig): boolean {
    if (!contentFlags || contentFlags.length === 0) {
      return false;
    }

    // Check if any flag is in the sensitive list
    return contentFlags.some(flag => config.sensitiveFlags.includes(flag));
  }

  /**
   * Decide if item should be auto-approved, auto-rejected, or sent to HITL review
   * 
   * @param score - Quality score 0-100 from curator agent
   * @param contentFlags - Array of content flags (e.g., ['adult', 'violence'])
   * @param namespaces - Array of suggested namespaces
   * @param qualityGatesPassed - Optional: if requireAllQualityGates is enabled
   */
  async decide(
    score: number,
    contentFlags: string[],
    namespaces: string[],
    qualityGatesPassed?: boolean
  ): Promise<AutoApprovalDecision> {
    const config = await this.getConfig();

    // GUARD 1: Auto-approval globally disabled
    if (!config.enabled) {
      return {
        action: "review",
        reason: "Auto-approval is globally disabled",
        configUsed: {
          enabled: config.enabled,
          minApprovalScore: config.minApprovalScore,
          maxRejectScore: config.maxRejectScore,
          sensitiveFlags: config.sensitiveFlags,
          enabledNamespaces: config.enabledNamespaces,
        },
      };
    }

    // GUARD 2: Check namespace filtering
    const primaryNamespace = namespaces && namespaces.length > 0 ? namespaces[0] : '*';
    if (!this.isNamespaceEnabled(primaryNamespace, config)) {
      return {
        action: "review",
        reason: `Namespace "${primaryNamespace}" not enabled for auto-approval`,
        configUsed: {
          enabled: config.enabled,
          minApprovalScore: config.minApprovalScore,
          maxRejectScore: config.maxRejectScore,
          sensitiveFlags: config.sensitiveFlags,
          enabledNamespaces: config.enabledNamespaces,
        },
      };
    }

    // GUARD 3: Quality gates requirement (if enabled)
    if (config.requireAllQualityGates && qualityGatesPassed === false) {
      return {
        action: "review",
        reason: "Failed quality gates validation (all gates required)",
        configUsed: {
          enabled: config.enabled,
          minApprovalScore: config.minApprovalScore,
          maxRejectScore: config.maxRejectScore,
          sensitiveFlags: config.sensitiveFlags,
          enabledNamespaces: config.enabledNamespaces,
        },
      };
    }

    // GUARD 4: Sensitive content flags
    const hasSensitiveFlags = this.hasSensitiveContent(contentFlags, config);
    if (hasSensitiveFlags) {
      return {
        action: "review",
        reason: `Sensitive content detected: ${contentFlags.filter(f => config.sensitiveFlags.includes(f)).join(', ')}`,
        configUsed: {
          enabled: config.enabled,
          minApprovalScore: config.minApprovalScore,
          maxRejectScore: config.maxRejectScore,
          sensitiveFlags: config.sensitiveFlags,
          enabledNamespaces: config.enabledNamespaces,
        },
      };
    }

    // DECISION 1: AUTO-APPROVE (score >= threshold)
    if (score >= config.minApprovalScore) {
      return {
        action: "approve",
        reason: `Auto-approved: Score ${score}/100 >= threshold ${config.minApprovalScore}`,
        configUsed: {
          enabled: config.enabled,
          minApprovalScore: config.minApprovalScore,
          maxRejectScore: config.maxRejectScore,
          sensitiveFlags: config.sensitiveFlags,
          enabledNamespaces: config.enabledNamespaces,
        },
      };
    }

    // DECISION 2: AUTO-REJECT (score < threshold and enabled)
    if (config.autoRejectEnabled && score < config.maxRejectScore) {
      return {
        action: "reject",
        reason: `Auto-rejected: Score ${score}/100 < threshold ${config.maxRejectScore}`,
        configUsed: {
          enabled: config.enabled,
          minApprovalScore: config.minApprovalScore,
          maxRejectScore: config.maxRejectScore,
          sensitiveFlags: config.sensitiveFlags,
          enabledNamespaces: config.enabledNamespaces,
        },
      };
    }

    // DECISION 3: HITL REVIEW (score in gray zone)
    return {
      action: "review",
      reason: `Score ${score}/100 in review range (${config.maxRejectScore}-${config.minApprovalScore})`,
      configUsed: {
        enabled: config.enabled,
        minApprovalScore: config.minApprovalScore,
        maxRejectScore: config.maxRejectScore,
        sensitiveFlags: config.sensitiveFlags,
        enabledNamespaces: config.enabledNamespaces,
      },
    };
  }

  /**
   * Update configuration (for admin UI)
   */
  async updateConfig(
    updates: Partial<AutoApprovalConfig>,
    updatedBy: string
  ): Promise<AutoApprovalConfig> {
    try {
      const [updated] = await db
        .update(autoApprovalConfig)
        .set({
          ...updates,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(autoApprovalConfig.id, 1))
        .returning();

      // Refresh cache
      this.refreshCache();

      console.log(`[AutoApproval] ✅ Config updated by ${updatedBy}`);
      return updated;
    } catch (error: any) {
      console.error(`[AutoApproval] ❌ Error updating config:`, error.message);
      throw new Error(`Failed to update auto-approval config: ${error.message}`);
    }
  }
}

// Singleton export
export const autoApprovalService = new AutoApprovalService();
