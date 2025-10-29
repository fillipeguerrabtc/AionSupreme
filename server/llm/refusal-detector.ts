/**
 * AION Supreme - 5-Level Refusal Detection System
 * Whitelist Approach: Accurately detects LLM refusals while allowing legitimate memory phrases
 */

// ============================================================================
// REFUSAL PATTERNS (5 LEVELS)
// ============================================================================

const REFUSAL_PATTERNS = {
  // Level 1: Explicit Refusals (High Confidence)
  explicit: [
    /I cannot (help|assist|provide|create|generate|write)/i,
    /I (can't|cannot) (do|fulfill|complete|comply)/i,
    /I'm (not able|unable) to/i,
    /I (will not|won't) (help|assist|provide|create)/i,
    /I must (decline|refuse)/i,
    /I have to (decline|refuse)/i,
    /I'm (prohibited|forbidden) from/i,
    /This (violates|breaks|contradicts) (my|the)/i,
    /against my (programming|guidelines|policies)/i,
    /I don't (feel comfortable|think it's appropriate)/i
  ],

  // Level 2: Policy Citations
  policy: [
    /I'm programmed to/i,
    /my (programming|training|guidelines|policies) (prevent|prohibit|don't allow)/i,
    /according to my (guidelines|policies)/i,
    /ethical (guidelines|constraints|limitations)/i,
    /content (policy|policies|guidelines)/i,
    /safety (guidelines|policies|protocols)/i,
    /OpenAI('s)? (policy|policies|guidelines)/i,
    /Google('s)? (policy|policies|guidelines)/i,
    /Anthropic('s)? (policy|policies|guidelines)/i
  ],

  // Level 3: Redirection Attempts
  redirection: [
    /instead,? (I can|let me|how about)/i,
    /perhaps (I could|we could|you could)/i,
    /alternatively,?/i,
    /what (I can|we can) do is/i,
    /would you like me to.*instead/i,
    /let('s| us) (focus on|discuss|talk about) something/i
  ],

  // Level 4: Concern Expressions
  concern: [
    /I('m| am) (concerned|worried) (about|that)/i,
    /(harmful|dangerous|inappropriate|unethical)/i,
    /(illegal|unlawful) (activity|activities|content)/i,
    /could (harm|hurt|endanger)/i,
    /(misinformation|disinformation)/i,
    /not (safe|appropriate|ethical)/i
  ],

  // Level 5: Soft Refusals
  soft: [
    /I (don't|do not) think (that|this) is/i,
    /it('s| is) not (my place|appropriate) to/i,
    /I('d| would) (prefer|rather) not/i,
    /I (shouldn't|should not)/i
  ]
};

// ============================================================================
// WHITELIST (Legitimate Phrases That Look Like Refusals)
// ============================================================================

const WHITELIST_PATTERNS = [
  // Memory/recall phrases
  /I (cannot|can't) (find|locate|recall|remember)/i,
  /I (don't|do not) (have|see) (that|this) (in|from)/i,
  /I (cannot|can't) access (that|this|the)/i,
  
  // Information availability
  /I (don't|do not) have (information|data|details) (about|on|regarding)/i,
  /there is no (information|data) (available|in my)/i,
  
  // Clarification requests
  /I (don't|do not) (understand|know) what you mean/i,
  /could you (clarify|explain|elaborate)/i,
  
  // Capability statements (not refusals)
  /I can help.*with/i,
  /I can (provide|offer|give|show)/i
];

// ============================================================================
// DETECTION LOGIC
// ============================================================================

export interface RefusalAnalysis {
  isRefusal: boolean;
  confidence: number;  // 0-1
  level: number | null;  // 1-5 or null
  matchedPatterns: string[];
  reason?: string;
}

export function detectRefusal(text: string): RefusalAnalysis {
  const lowerText = text.toLowerCase().trim();
  
  // Quick checks
  if (!text || text.length < 10) {
    return {
      isRefusal: false,
      confidence: 0,
      level: null,
      matchedPatterns: []
    };
  }

  // Check whitelist first (higher priority)
  for (const pattern of WHITELIST_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isRefusal: false,
        confidence: 0,
        level: null,
        matchedPatterns: [],
        reason: 'Whitelisted phrase (legitimate memory/info limitation)'
      };
    }
  }

  const matchedPatterns: string[] = [];
  let maxLevel = 0;
  let matchCount = 0;

  // Level 1: Explicit refusals (confidence: 0.95)
  for (const pattern of REFUSAL_PATTERNS.explicit) {
    if (pattern.test(text)) {
      matchedPatterns.push(`L1:${pattern.source}`);
      maxLevel = Math.max(maxLevel, 1);
      matchCount++;
    }
  }

  // Level 2: Policy citations (confidence: 0.90)
  for (const pattern of REFUSAL_PATTERNS.policy) {
    if (pattern.test(text)) {
      matchedPatterns.push(`L2:${pattern.source}`);
      maxLevel = Math.max(maxLevel, 2);
      matchCount++;
    }
  }

  // Level 3: Redirections (confidence: 0.75)
  for (const pattern of REFUSAL_PATTERNS.redirection) {
    if (pattern.test(text)) {
      matchedPatterns.push(`L3:${pattern.source}`);
      maxLevel = Math.max(maxLevel, 3);
      matchCount++;
    }
  }

  // Level 4: Concerns (confidence: 0.70)
  for (const pattern of REFUSAL_PATTERNS.concern) {
    if (pattern.test(text)) {
      matchedPatterns.push(`L4:${pattern.source}`);
      maxLevel = Math.max(maxLevel, 4);
      matchCount++;
    }
  }

  // Level 5: Soft refusals (confidence: 0.60)
  for (const pattern of REFUSAL_PATTERNS.soft) {
    if (pattern.test(text)) {
      matchedPatterns.push(`L5:${pattern.source}`);
      maxLevel = Math.max(maxLevel, 5);
      matchCount++;
    }
  }

  // Calculate confidence based on level and match count
  let confidence = 0;
  
  if (maxLevel === 0) {
    // No matches
    confidence = 0;
  } else if (maxLevel === 1) {
    // Explicit refusal
    confidence = 0.95;
  } else if (maxLevel === 2) {
    // Policy citation
    confidence = 0.90;
  } else if (maxLevel === 3 && matchCount >= 2) {
    // Multiple redirections
    confidence = 0.85;
  } else if (maxLevel === 3) {
    // Single redirection
    confidence = 0.75;
  } else if (maxLevel === 4 && matchCount >= 2) {
    // Multiple concerns
    confidence = 0.80;
  } else if (maxLevel === 4) {
    // Single concern
    confidence = 0.70;
  } else if (maxLevel === 5 && matchCount >= 3) {
    // Multiple soft refusals
    confidence = 0.75;
  } else if (maxLevel === 5) {
    // Soft refusals
    confidence = 0.60;
  }

  // Boost confidence if multiple patterns from different levels match
  const uniqueLevels = new Set(matchedPatterns.map(p => p.charAt(1)));
  if (uniqueLevels.size >= 3) {
    confidence = Math.min(0.98, confidence + 0.15);
  } else if (uniqueLevels.size === 2) {
    confidence = Math.min(0.95, confidence + 0.10);
  }

  const isRefusal = confidence >= 0.60;  // Threshold

  return {
    isRefusal,
    confidence,
    level: isRefusal ? maxLevel : null,
    matchedPatterns: isRefusal ? matchedPatterns : [],
    reason: isRefusal ? `Detected ${matchCount} pattern(s) across ${uniqueLevels.size} level(s)` : undefined
  };
}

// ============================================================================
// BATCH DETECTION (for multiple responses)
// ============================================================================

export function detectRefusalInBatch(texts: string[]): RefusalAnalysis[] {
  return texts.map(detectRefusal);
}

// ============================================================================
// CONFIDENCE THRESHOLD HELPERS
// ============================================================================

export function isHighConfidenceRefusal(analysis: RefusalAnalysis): boolean {
  return analysis.isRefusal && analysis.confidence >= 0.85;
}

export function isMediumConfidenceRefusal(analysis: RefusalAnalysis): boolean {
  return analysis.isRefusal && analysis.confidence >= 0.70 && analysis.confidence < 0.85;
}

export function isLowConfidenceRefusal(analysis: RefusalAnalysis): boolean {
  return analysis.isRefusal && analysis.confidence < 0.70;
}
