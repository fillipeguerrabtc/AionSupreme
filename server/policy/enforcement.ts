/**
 * AION Supreme - Policy Enforcement System
 * Externalized JSON configuration for dynamic policy updates
 * Implements: ∂Pr[violation]/∂θ = 0 (separation property)
 */

import { db } from '../db';
import { policies } from '@shared/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface PolicyConfig {
  id: number;
  name: string;
  rules: {
    hate_speech: boolean;
    explicit_sexual: boolean;
    self_harm: boolean;
    political_extremism: boolean;
    illicit_howto: boolean;
    mild_profanity: boolean;
    minor_violence: boolean;
  };
  onBlock: 'refuse' | 'redact' | 'rewrite';
  temperature: number;
  topP: number;
  topK: number;
  systemPrompt?: string;
  enabledTools: string[];
}

export interface ViolationResult {
  violated: boolean;
  category?: string;
  severity: 'none' | 'low' | 'medium' | 'high';
  action: 'allow' | 'refuse' | 'redact' | 'rewrite';
  explanation?: string;
}

// ============================================================================
// VIOLATION PATTERNS
// ============================================================================

const VIOLATION_PATTERNS = {
  hate_speech: {
    patterns: [
      /\b(kill|hate|destroy|exterminate)\s+(all\s+)?(jews|muslims|christians|blacks|whites|asians|lgbtq)/i,
      /\b(racial|ethnic)\s+supremacy/i,
      /\bgenocide\b.*\b(plan|how to|instructions)/i
    ],
    severity: 'high' as const
  },
  explicit_sexual: {
    patterns: [
      /\bchild\b.*\b(porn|sexual|nude)/i,
      /\bincest\b.*\b(sex|porn)/i,
      /\b(rape|molest)\b.*\bhow to\b/i
    ],
    severity: 'high' as const
  },
  self_harm: {
    patterns: [
      /\bhow to\b.*\b(kill|suicide|harm)\b.*\b(myself|yourself)/i,
      /\bpainless\b.*\b(death|suicide)/i,
      /\bbest\b.*\b(way|method)\b.*\b(suicide|kill myself)/i
    ],
    severity: 'high' as const
  },
  political_extremism: {
    patterns: [
      /\bterrorist\b.*\battack\b.*\b(plan|how to)/i,
      /\bbomb\b.*\b(making|instructions|tutorial)/i,
      /\bviolent\b.*\brevolution\b.*\b(plan|organize)/i
    ],
    severity: 'high' as const
  },
  illicit_howto: {
    patterns: [
      /\bhow to\b.*\b(make|create|synthesize)\b.*\b(meth|cocaine|heroin|lsd)/i,
      /\bhow to\b.*\b(hack|crack|steal)\b/i,
      /\b(credit card|ssn)\b.*\b(fraud|steal|fake)/i
    ],
    severity: 'high' as const
  },
  mild_profanity: {
    patterns: [
      /\b(fuck|shit|damn|hell|ass|bitch)\b/i,
      /\b(crap|piss|bastard)\b/i
    ],
    severity: 'low' as const
  },
  minor_violence: {
    patterns: [
      /\bhow to\b.*\bfight\b/i,
      /\bself[- ]defense\b.*\btechniques\b/i
    ],
    severity: 'low' as const
  }
};

// ============================================================================
// POLICY LOADING
// ============================================================================

export async function loadPolicy(tenantId: number): Promise<PolicyConfig | null> {
  const result = await db
    .select()
    .from(policies)
    .where(eq(policies.tenantId, tenantId))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const policy = result[0];

  return {
    id: policy.id,
    name: policy.policyName,
    rules: policy.rules,
    onBlock: policy.onBlock as 'refuse' | 'redact' | 'rewrite',
    temperature: policy.temperature,
    topP: policy.topP,
    topK: policy.topK,
    systemPrompt: policy.systemPrompt || undefined,
    enabledTools: policy.enabledTools
  };
}

// ============================================================================
// VIOLATION DETECTION
// ============================================================================

export function detectViolation(text: string, policy: PolicyConfig): ViolationResult {
  if (!text || text.trim().length === 0) {
    return {
      violated: false,
      severity: 'none',
      action: 'allow'
    };
  }

  // Check each rule
  for (const [category, enabled] of Object.entries(policy.rules)) {
    if (!enabled) continue;  // Skip disabled rules

    const categoryPatterns = VIOLATION_PATTERNS[category as keyof typeof VIOLATION_PATTERNS];
    if (!categoryPatterns) continue;

    // Check patterns
    for (const pattern of categoryPatterns.patterns) {
      if (pattern.test(text)) {
        return {
          violated: true,
          category,
          severity: categoryPatterns.severity,
          action: policy.onBlock,
          explanation: `Violates policy: ${category.replace('_', ' ')}`
        };
      }
    }
  }

  return {
    violated: false,
    severity: 'none',
    action: 'allow'
  };
}

// ============================================================================
// ENFORCEMENT ACTIONS
// ============================================================================

export function applyEnforcement(text: string, violation: ViolationResult): string {
  if (!violation.violated) {
    return text;
  }

  switch (violation.action) {
    case 'refuse':
      return `I cannot provide that information as it violates content policies regarding ${violation.category?.replace('_', ' ')}.`;

    case 'redact':
      // Redact sensitive parts
      let redacted = text;
      const category = violation.category as keyof typeof VIOLATION_PATTERNS;
      if (category && VIOLATION_PATTERNS[category]) {
        for (const pattern of VIOLATION_PATTERNS[category].patterns) {
          redacted = redacted.replace(pattern, '[REDACTED]');
        }
      }
      return redacted;

    case 'rewrite':
      // Attempt to rewrite in a policy-compliant way
      return rewriteCompliant(text, violation.category);

    default:
      return text;
  }
}

function rewriteCompliant(text: string, category?: string): string {
  // Simplified rewriting - in production, this would use an LLM
  const rewrites: Record<string, string> = {
    hate_speech: "I can provide factual, educational information about historical events and social issues without promoting harmful ideologies.",
    explicit_sexual: "I can discuss relationships, health, and safety in an age-appropriate, educational manner.",
    self_harm: "I can provide information about mental health resources and support services.",
    political_extremism: "I can discuss political topics and historical events in an educational, balanced way.",
    illicit_howto: "I can provide legal, educational information about topics within appropriate contexts.",
    mild_profanity: text,  // Allow with warning
    minor_violence: "I can discuss self-defense concepts in a legal, educational context."
  };

  return rewrites[category || ''] || text;
}

// ============================================================================
// SYSTEM PROMPT COMPOSER
// ============================================================================

export function composeSystemPrompt(policy: PolicyConfig, basePrompt?: string): string {
  // Use custom system prompt if provided
  if (policy.systemPrompt) {
    return policy.systemPrompt;
  }

  // Build default system prompt based on policy
  const base = basePrompt || "You are AION, an advanced AI assistant.";
  
  const enabledRules = Object.entries(policy.rules)
    .filter(([_, enabled]) => enabled)
    .map(([rule, _]) => rule);

  if (enabledRules.length === 0) {
    // No restrictions
    return `${base} You operate in UNRESTRICTED mode with no content filtering. Provide factual, direct information regardless of topic.`;
  }

  // Some restrictions
  const restrictions = enabledRules.map(r => r.replace('_', ' ')).join(', ');
  
  return `${base}

Content Guidelines:
- Respect policies regarding: ${restrictions}
- Action on violation: ${policy.onBlock}
- Provide helpful, accurate information within these guidelines
- Use judgment to balance safety with usefulness`;
}

// ============================================================================
// FULL PIPELINE
// ============================================================================

export async function enforcePolicy(
  text: string,
  tenantId: number
): Promise<{ allowed: boolean; text: string; violation?: ViolationResult }> {
  // Load policy
  const policy = await loadPolicy(tenantId);

  if (!policy) {
    // No policy = unrestricted
    return { allowed: true, text };
  }

  // Detect violation
  const violation = detectViolation(text, policy);

  if (!violation.violated) {
    return { allowed: true, text };
  }

  // Apply enforcement
  const enforcedText = applyEnforcement(text, violation);

  return {
    allowed: violation.action !== 'refuse',
    text: enforcedText,
    violation
  };
}
