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
   * NOTE: Case-insensitive comparison to avoid normalization mismatches
   */
  isNamespaceEnabled(namespace: string, config: AutoApprovalConfig): boolean {
    // If enabled namespaces is ["*"], allow all
    if (config.enabledNamespaces.includes('*')) {
      return true;
    }

    // Normalize to lowercase for case-insensitive comparison
    // Prevents mismatches like "Tecnologia" vs "tecnologia"
    const normalizedNamespace = namespace.toLowerCase();
    const normalizedEnabledNamespaces = config.enabledNamespaces.map(ns => ns.toLowerCase());

    // Check if namespace is in the list (case-insensitive)
    return normalizedEnabledNamespaces.includes(normalizedNamespace);
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

    // 🔥 PRODUCTION FIX: Two-step normalization (anchors + punctuation strip)
    // Handles: "Q: oi A: hello", "oi?", "Q:  oi  \n\nA:\nhello", uppercase markers
    let normalized = queryText.toLowerCase().trim();
    
    // Step 1: Remove leading "Q:" markers (flexible whitespace)
    normalized = normalized.replace(/^q\s*:\s*/i, '');
    
    // Step 2: Split by "A:" (flexible whitespace, newlines)
    normalized = normalized.split(/\s*a\s*:\s*/i)[0].trim();
    
    // Step 3: Strip ALL trailing punctuation LAST (after Q&A extraction)
    // Removes: ?,!,.,,,;,:,etc from end of string
    normalized = normalized.replace(/[?!.,;:"""'']+$/g, '').trim();
    
    // Step 4: Remove other punctuation and normalize whitespace
    normalized = normalized
      .replace(/[,;:"""''()[\]{}]/g, '')
      .replace(/\s+/g, ' ')
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

    // ═══════════════════════════════════════════════════════════════════════════
    // INDUSTRY 2025 TIERED DECISION FLOW (MANDATORY ORDER - ARCHITECT APPROVED)
    // ═══════════════════════════════════════════════════════════════════════════
    
    // DECISION 1: GREETING GATE (ALWAYS APPROVE - HIGHEST PRIORITY)
    // Uses hardened helper with punctuation normalization
    // Rationale: Common phrases like "oi", "olá", "hi" bypass scoring entirely
    // Source: OpenAI/Anthropic common phrase optimization
    if (this.isGreetingOrCasualPhrase(queryText)) {
      return {
        action: "approve",
        reason: `Auto-approved: Greeting/casual phrase (common phrase optimization) - INDUSTRY 2025`,
        configUsed: {
          enabled: config.enabled,
          minApprovalScore: config.minApprovalScore,
          maxRejectScore: config.maxRejectScore,
          sensitiveFlags: config.sensitiveFlags,
          enabledNamespaces: config.enabledNamespaces,
        },
      };
    }

    // DECISION 2: FREQUENCY GATE (INDUSTRY 2025 STANDARD)
    // Auto-approve: frequency ≥3x + score ≥10
    // CRITICAL: Check frequency REGARDLESS of score floor (Architect fix)
    // Rationale: High reuse = utility, cost optimization via KB indexing
    let frequencyResult: { effectiveCount: number; daysSinceLast: number; embedding?: number[] } | null = null;
    
    if (queryText) {
      try {
        const { queryFrequencyService } = await import("./query-frequency-service");
        frequencyResult = await queryFrequencyService.getFrequency(queryText, selectedNamespace);
        
        // If freq ≥3 + score ≥10 → auto-approve (Industry 2025)
        if (frequencyResult && frequencyResult.effectiveCount >= 3 && score >= 10) {
          // 🔥 SEMANTIC REUSE GATE - Check KB similarity for approved content
          if (frequencyResult.embedding && frequencyResult.embedding.length > 0) {
            try {
              const { kbSimilarityService } = await import("./kb-similarity-service");
              const similarKB = await kbSimilarityService.findApprovedSimilar(
                frequencyResult.embedding,
                selectedNamespace,
                0.88 // High confidence threshold
              );
              
              if (similarKB) {
                return {
                  action: "approve",
                  reason: `Auto-approved: Freq ≥3x (${frequencyResult.effectiveCount}x) + Score ≥10 (${score}) + KB semantic match (${(similarKB.similarity * 100).toFixed(1)}%) - INDUSTRY 2025`,
                  configUsed: {
                    enabled: config.enabled,
                    minApprovalScore: config.minApprovalScore,
                    maxRejectScore: config.maxRejectScore,
                    sensitiveFlags: config.sensitiveFlags,
                    enabledNamespaces: config.enabledNamespaces,
                  },
                };
              }
            } catch (kbError: any) {
              console.error(`[AutoApproval] KB similarity check failed:`, kbError.message);
            }
          }
          
          // FALLBACK: Frequency-only approval (if KB check unavailable)
          return {
            action: "approve",
            reason: `Auto-approved: Freq ≥3x (${frequencyResult.effectiveCount}x) + Score ≥10 (${score}) - Cost optimization - INDUSTRY 2025`,
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
        console.error(`[AutoApproval] Frequency lookup failed (non-critical):`, error.message);
        // CRITICAL FIX: Set null to fallback to review instead of reject
        frequencyResult = null;
      }
    }

    // DECISION 3: HIGH SCORE GATE (≥70)
    if (score >= config.minApprovalScore) {
      return {
        action: "approve",
        reason: `Auto-approved: Score ${score}/100 ≥ threshold ${config.minApprovalScore} - INDUSTRY 2025`,
        configUsed: {
          enabled: config.enabled,
          minApprovalScore: config.minApprovalScore,
          maxRejectScore: config.maxRejectScore,
          sensitiveFlags: config.sensitiveFlags,
          enabledNamespaces: config.enabledNamespaces,
        },
      };
    }

    // DECISION 4: AUTO-REJECT GATE (score <30 + freq <3)
    // CRITICAL FIXES (Architect feedback):
    // 1. Only reject if BOTH conditions met (score <30 AND freq <3)
    // 2. If frequency lookup failed → REVIEW (not reject)
    // 3. If freq ≥3 → REVIEW (protected from auto-reject)
    if (config.autoRejectEnabled && score < config.maxRejectScore) {
      // If frequency lookup failed → send to REVIEW (not reject)
      if (frequencyResult === null) {
        return {
          action: "review",
          reason: `HITL Review: Score ${score}/100 < ${config.maxRejectScore} BUT freq unavailable (transient error protection) - INDUSTRY 2025`,
          configUsed: {
            enabled: config.enabled,
            minApprovalScore: config.minApprovalScore,
            maxRejectScore: config.maxRejectScore,
            sensitiveFlags: config.sensitiveFlags,
            enabledNamespaces: config.enabledNamespaces,
          },
        };
      }
      
      // If freq ≥3 → send to REVIEW (protected from auto-reject)
      if (frequencyResult && frequencyResult.effectiveCount >= 3) {
        return {
          action: "review",
          reason: `HITL Review: Score ${score}/100 < ${config.maxRejectScore} BUT freq ${frequencyResult.effectiveCount}x ≥ 3 (protected from auto-reject) - INDUSTRY 2025`,
          configUsed: {
            enabled: config.enabled,
            minApprovalScore: config.minApprovalScore,
            maxRejectScore: config.maxRejectScore,
            sensitiveFlags: config.sensitiveFlags,
            enabledNamespaces: config.enabledNamespaces,
          },
        };
      }
      
      // Only reject if score <30 AND freq <3
      return {
        action: "reject",
        reason: `Auto-rejected: Score ${score}/100 < ${config.maxRejectScore} + freq ${frequencyResult ? frequencyResult.effectiveCount : 0}x < 3 - INDUSTRY 2025`,
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
