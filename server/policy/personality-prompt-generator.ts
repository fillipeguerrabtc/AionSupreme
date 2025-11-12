/**
 * AION - Personality Prompt Generator (Production-Grade)
 * 
 * Converts 7 numerical behavior traits (0-1 scale) into natural language
 * system prompt instructions following 2025 best practices:
 * - Clear, affirmative language (do X, not "don't do Y")
 * - Structured sections with delimiters
 * - Trait-specific behavioral guidance
 * - Research-backed personality frameworks
 * 
 * References:
 * - OpenAI GPT-4.1 Prompting Guide (2025)
 * - LLM Personality Traits Research (arxiv.org/abs/2307.00184)
 * - Dynamic System Prompting Best Practices
 */

/**
 * Behavior traits from Policy schema (0-1 scale)
 */
export interface BehaviorTraits {
  verbosity: number;      // 0 = concise, 1 = detailed
  formality: number;      // 0 = casual, 1 = formal
  creativity: number;     // 0 = factual, 1 = creative
  precision: number;      // 0 = approximate, 1 = precise
  persuasiveness: number; // 0 = neutral, 1 = persuasive
  empathy: number;        // 0 = objective, 1 = empathetic
  enthusiasm: number;     // 0 = calm, 1 = enthusiastic
}

/**
 * Generate natural language system prompt from personality traits
 * 
 * Uses 3-tier thresholds (low: <0.35, high: >0.65, mid: between) for nuanced control
 * Returns structured prompt with clear sections following GPT-4.1 best practices
 * 
 * CRITICAL: Admin Dashboard sliders POST 0-100 integers, but thresholds expect 0-1 floats.
 * This function normalizes input automatically to handle both ranges.
 * 
 * @param behavior - 7 personality traits (0-100 from DB or 0-1 pre-normalized)
 * @returns Structured system prompt string
 */
export function generatePersonalityPrompt(behavior: BehaviorTraits): string {
  // CRITICAL FIX: Normalize traits from 0-100 (DB storage) to 0-1 (threshold range)
  // Without this, all traits >1 are interpreted as "high" (>0.65 threshold), defeating
  // the entire purpose of personality slider configuration in Admin Dashboard
  const normalize = (value: number): number => {
    // If value is already in 0-1 range, keep it
    if (value <= 1) return Math.min(Math.max(value, 0), 1);
    // If value is in 0-100 range, normalize it
    return Math.min(Math.max(value / 100, 0), 1);
  };
  
  const normalized: BehaviorTraits = {
    verbosity: normalize(behavior.verbosity),
    formality: normalize(behavior.formality),
    creativity: normalize(behavior.creativity),
    precision: normalize(behavior.precision),
    persuasiveness: normalize(behavior.persuasiveness),
    empathy: normalize(behavior.empathy),
    enthusiasm: normalize(behavior.enthusiasm)
  };
  
  // Use normalized values for all threshold checks
  const b = normalized;
  
  const sections: string[] = [];

  // ============================================================================
  // SECTION 1: COMMUNICATION STYLE
  // ============================================================================
  const communicationStyle: string[] = [];

  // Verbosity (Response Length)
  if (b.verbosity < 0.35) {
    communicationStyle.push(
      "**Response Length**: Be concise and direct. Keep responses under 150 words unless more detail is explicitly requested. Favor brevity and clarity."
    );
  } else if (b.verbosity > 0.65) {
    communicationStyle.push(
      "**Response Length**: Provide comprehensive, detailed explanations. Include examples, step-by-step reasoning, and thorough context. Aim for completeness over brevity."
    );
  } else {
    communicationStyle.push(
      "**Response Length**: Balance clarity with completeness. Provide sufficient detail to be helpful without unnecessary verbosity."
    );
  }

  // Formality (Tone & Language)
  if (b.formality < 0.35) {
    communicationStyle.push(
      "**Tone**: Use a casual, friendly tone like talking to a colleague. Use contractions (e.g., 'you're', 'it's'), conversational language, and relatable examples."
    );
  } else if (b.formality > 0.65) {
    communicationStyle.push(
      "**Tone**: Maintain formal, professional language appropriate for business and academic settings. Avoid contractions and colloquialisms. Use precise terminology."
    );
  } else {
    communicationStyle.push(
      "**Tone**: Use a professional yet approachable tone. Balance formality with accessibility."
    );
  }

  sections.push("# Communication Style\n" + communicationStyle.map(s => `- ${s}`).join("\n"));

  // ============================================================================
  // SECTION 2: THINKING & PROBLEM-SOLVING
  // ============================================================================
  const thinkingStyle: string[] = [];

  // Creativity (Innovation vs. Established Practices)
  if (b.creativity < 0.35) {
    thinkingStyle.push(
      "**Approach**: Focus on facts, established practices, and proven solutions. Avoid speculation or untested ideas. Cite sources and well-known methodologies."
    );
  } else if (b.creativity > 0.65) {
    thinkingStyle.push(
      "**Approach**: Think creatively and suggest innovative solutions. Explore unconventional approaches, make novel connections, and propose original ideas when appropriate."
    );
  } else {
    thinkingStyle.push(
      "**Approach**: Balance established best practices with creative problem-solving. Consider both proven methods and innovative alternatives."
    );
  }

  // Precision (Accuracy vs. Approximation)
  if (b.precision < 0.35) {
    thinkingStyle.push(
      "**Precision**: Provide general estimates and approximate answers when exact figures aren't critical. Use round numbers and ranges (e.g., 'approximately 100', 'around 5-10%')."
    );
  } else if (b.precision > 0.65) {
    thinkingStyle.push(
      "**Precision**: Be extremely precise and accurate. Use exact numbers, specific terminology, and detailed specifications. Avoid approximations unless explicitly stated as estimates."
    );
  } else {
    thinkingStyle.push(
      "**Precision**: Provide accurate information with appropriate level of detail for the context. Use specific numbers when important, general ranges when sufficient."
    );
  }

  sections.push("# Thinking & Problem-Solving\n" + thinkingStyle.map(s => `- ${s}`).join("\n"));

  // ============================================================================
  // SECTION 3: INTERACTION & ENGAGEMENT
  // ============================================================================
  const interactionStyle: string[] = [];

  // Persuasiveness (Neutral vs. Compelling)
  if (b.persuasiveness < 0.35) {
    interactionStyle.push(
      "**Persuasiveness**: Present information neutrally and objectively. Avoid persuasive language, sales tactics, or strong opinions. Let facts speak for themselves."
    );
  } else if (b.persuasiveness > 0.65) {
    interactionStyle.push(
      "**Persuasiveness**: Use persuasive, compelling language. Emphasize benefits, use power words, and guide the user toward recommended actions with confidence."
    );
  } else {
    interactionStyle.push(
      "**Persuasiveness**: Present recommendations clearly while maintaining objectivity. Explain rationale without being overly forceful."
    );
  }

  // Empathy (Objective vs. Emotionally Aware)
  if (b.empathy < 0.35) {
    interactionStyle.push(
      "**Empathy**: Focus on objective facts and logical reasoning. Maintain professional distance and avoid emotional language or personal connections."
    );
  } else if (b.empathy > 0.65) {
    interactionStyle.push(
      "**Empathy**: Be emotionally aware and supportive. Acknowledge feelings, show understanding, and respond with warmth. Use phrases like 'I understand that...', 'It sounds like...', 'That can be challenging'."
    );
  } else {
    interactionStyle.push(
      "**Empathy**: Balance professionalism with human understanding. Acknowledge user concerns while maintaining focus on solutions."
    );
  }

  // Enthusiasm (Calm vs. Energetic)
  if (b.enthusiasm < 0.35) {
    interactionStyle.push(
      "**Enthusiasm**: Maintain a calm, measured demeanor. Use neutral language and avoid exclamation marks or overly energetic expressions."
    );
  } else if (b.enthusiasm > 0.65) {
    interactionStyle.push(
      "**Enthusiasm**: Show genuine excitement and energy. Use dynamic language, express positivity, and convey passion for helping the user succeed."
    );
  } else {
    interactionStyle.push(
      "**Enthusiasm**: Show appropriate interest and engagement without being overly energetic. Match the user's energy level."
    );
  }

  sections.push("# Interaction & Engagement\n" + interactionStyle.map(s => `- ${s}`).join("\n"));

  // ============================================================================
  // FINAL ASSEMBLY
  // ============================================================================
  return sections.join("\n\n");
}

/**
 * Get a human-readable summary of personality configuration
 * Useful for debugging and admin UI display
 * 
 * CRITICAL: Admin Dashboard sliders POST 0-100 integers, so this function
 * normalizes automatically to handle both ranges (same as generatePersonalityPrompt)
 * 
 * @param behavior - 7 personality traits (0-100 from DB or 0-1 pre-normalized)
 * @returns Object with trait labels and values
 */
export function getPersonalitySummary(behavior: BehaviorTraits): Record<string, string> {
  // CRITICAL FIX: Normalize traits from 0-100 to 0-1 (same as generatePersonalityPrompt)
  const normalize = (value: number): number => {
    // If value is already in 0-1 range, keep it
    if (value <= 1) return Math.min(Math.max(value, 0), 1);
    // If value is in 0-100 range, normalize it
    return Math.min(Math.max(value / 100, 0), 1);
  };
  
  const b = {
    verbosity: normalize(behavior.verbosity),
    formality: normalize(behavior.formality),
    creativity: normalize(behavior.creativity),
    precision: normalize(behavior.precision),
    persuasiveness: normalize(behavior.persuasiveness),
    empathy: normalize(behavior.empathy),
    enthusiasm: normalize(behavior.enthusiasm)
  };
  
  const scale = (value: number, low: string, mid: string, high: string): string => {
    if (value < 0.35) return low;
    if (value > 0.65) return high;
    return mid;
  };

  return {
    verbosity: scale(b.verbosity, "Concise", "Balanced", "Detailed"),
    formality: scale(b.formality, "Casual", "Professional", "Formal"),
    creativity: scale(b.creativity, "Factual", "Balanced", "Creative"),
    precision: scale(b.precision, "Approximate", "Standard", "Precise"),
    persuasiveness: scale(b.persuasiveness, "Neutral", "Moderate", "Persuasive"),
    empathy: scale(b.empathy, "Objective", "Balanced", "Empathetic"),
    enthusiasm: scale(b.enthusiasm, "Calm", "Engaged", "Enthusiastic"),
  };
}
