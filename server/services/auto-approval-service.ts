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
            minApprovalScore: 70,
            maxRejectScore: 30,
            sensitiveFlags: ['adult', 'violence', 'medical', 'finance', 'legal', 'pii', 'hate-speech'],
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
        minApprovalScore: 70,
        maxRejectScore: 30,
        sensitiveFlags: ['adult', 'violence', 'medical', 'finance', 'legal', 'pii', 'hate-speech'],
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
   * GREETING GATE - Detect common greetings and casual phrases
   * Best Practice 2025: Auto-approve greetings to train internal model
   * Supports PT-BR, EN-US, ES-ES
   */
  isGreetingOrCasualPhrase(queryText?: string): boolean {
    if (!queryText) return false;

    // Normalize: lowercase, trim, remove Q&A markers (inline AND multiline), remove punctuation
    // 🔥 BUG FIX #2 v2: Strip Q&A markers for BOTH inline ("Q: oi A: hello") AND multiline ("Q: oi\n\nA: hello")
    const normalized = queryText
      .toLowerCase()
      .trim()
      .replace(/^q:\s*/i, '') // Remove leading "Q: " prefix
      .split(/\s+a:\s*/i)[0] // Split on " A: " (inline OR multiline) and take question part only
      .replace(/[.,!?;:"""''()[\]{}]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Greeting patterns (PT/EN/ES) - matches greetings at START of text
    const greetingPatterns = [
      // Portuguese - common greetings
      /^(oi|olá|ola|opa)\b/i,
      /^(e aí|e ai)\b/i,
      /^(bom dia|boa tarde|boa noite)\b/i,
      /^(tchau|ate logo|até logo|falou|valeu)\b/i,
      /^(beleza|tudo bem|tudo bom)\b/i,
      /^(como vai|como você está|como voce esta)\b/i,
      /^(obrigad[ao]|de nada|por favor)\b/i,
      /^(com licença|com licenca)\b/i,
      
      // English - common greetings
      /^(hi|hello|hey|yo|sup)\b/i,
      /^(good morning|good afternoon|good evening|good night)\b/i,
      /^(goodbye|bye|see you|later)\b/i,
      /^(thanks|thank you)\b/i,
      /^(you're welcome|youre welcome|please|excuse me)\b/i,
      /^(how are you|how do you do|how are you doing)\b/i,
      /^(whats up|what's up|wassup)\b/i,
      
      // Spanish - common greetings
      /^(hola)\b/i,
      /^(buenos días|buenos dias|buenas tardes|buenas noches)\b/i,
      /^(adiós|adios|hasta luego|chau)\b/i,
      /^(gracias|de nada|por favor)\b/i,
      /^(perdón|perdon)\b/i,
      /^(cómo estás|como estas|qué tal|que tal)\b/i,
    ];

    return greetingPatterns.some(pattern => pattern.test(normalized));
  }

  /**
   * Decide if item should be auto-approved, auto-rejected, or sent to HITL review
   * 
   * BEST PRACTICE 2025: Cost-aware approval with semantic query frequency tracking
   * - High quality (≥70) → auto-approve
   * - High reuse value (40-69 score + ≥3x frequency) → auto-approve (cost optimization)
   * - Low quality (<30) → auto-reject
   * - Otherwise → HITL review
   * 
   * @param score - Quality score 0-100 from curator agent
   * @param contentFlags - Array of content flags (e.g., ['adult', 'violence'])
   * @param namespaces - Array of suggested namespaces
   * @param qualityGatesPassed - Optional: if requireAllQualityGates is enabled
   * @param queryText - Optional: original query for frequency tracking (reuse gate)
   */
  async decide(
    score: number,
    contentFlags: string[],
    namespaces: string[],
    qualityGatesPassed?: boolean,
    queryText?: string
  ): Promise<AutoApprovalDecision> {
    const config = await this.getConfig();

    // 🚀 GREETING GATE - HIGHEST PRIORITY (bypasses all other checks)
    // Best Practice 2025: Auto-approve greetings regardless of score
    // Rationale: Train internal model with common phrases to reduce external API costs
    if (this.isGreetingOrCasualPhrase(queryText)) {
      return {
        action: "approve",
        reason: `Auto-approved: Greeting/casual phrase detected - Training internal model for cost optimization`,
        configUsed: {
          enabled: config.enabled,
          minApprovalScore: config.minApprovalScore,
          maxRejectScore: config.maxRejectScore,
          sensitiveFlags: config.sensitiveFlags,
          enabledNamespaces: config.enabledNamespaces,
        },
      };
    }

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
    // FIX: Iterate suggestedNamespaces array to find FIRST ENABLED namespace
    // Rationale: AutoIndexer provides ranked array (e.g., ["raw_intake", "geral", "portugal"])
    // Old bug: Checked only namespaces[0], failed if first was disabled
    // New behavior: Use first enabled namespace from ranked list
    let selectedNamespace = '*'; // Default wildcard
    if (namespaces && namespaces.length > 0) {
      // Find first enabled namespace in ranked order
      const enabledNamespace = namespaces.find(ns => this.isNamespaceEnabled(ns, config));
      if (enabledNamespace) {
        selectedNamespace = enabledNamespace;
        console.log(`[AutoApproval] ✅ Selected namespace "${selectedNamespace}" from ranked list: [${namespaces.join(', ')}]`);
      }
    }
    
    // Only reject if NO namespaces are enabled (not just first)
    if (selectedNamespace === '*' && !config.enabledNamespaces.includes('*')) {
      return {
        action: "review",
        reason: `No enabled namespace found in: [${namespaces?.join(', ') || 'none'}]. Enabled: [${config.enabledNamespaces.join(', ')}]`,
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

    // DECISION 2: REUSE GATE - Cost-optimization for high-frequency queries
    // If score is in gray zone (40-69) BUT query is frequently asked (≥3x in 7 days)
    // → Approve to reduce external API costs via indexing
    if (queryText && score >= 40 && score < config.minApprovalScore) {
      try {
        const { queryFrequencyService } = await import("./query-frequency-service");
        const frequency = await queryFrequencyService.getFrequency(queryText, selectedNamespace);
        
        if (frequency && frequency.effectiveCount >= 3) {
          return {
            action: "approve",
            reason: `Auto-approved: High-reuse value (score ${score}, query frequency ${frequency.effectiveCount}x in ${frequency.daysSinceLast}d) - Cost optimization via indexing`,
            configUsed: {
              enabled: config.enabled,
              minApprovalScore: config.minApprovalScore,
              maxRejectScore: config.maxRejectScore,
              sensitiveFlags: config.sensitiveFlags,
              enabledNamespaces: config.enabledNamespaces,
            },
          };
        }
      } catch (error: any) {
        console.error(`[AutoApproval] Reuse gate check failed:`, error.message);
        // Non-critical - continue with normal flow
      }
    }

    // DECISION 3: AUTO-REJECT (score < threshold and enabled)
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

    // DECISION 4: HITL REVIEW (score in gray zone, low frequency)
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
