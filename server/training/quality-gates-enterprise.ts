/**
 * ENTERPRISE QUALITY GATES - Production-Grade Training Data Validation
 * 
 * Implementa múltiplas camadas de validação para garantir qualidade enterprise:
 * 1. Length & Format validation (básico)
 * 2. Toxicity detection (content safety)
 * 3. PII detection (privacy)
 * 4. Factuality heuristics (truthfulness)
 * 5. Semantic coherence (instruction-response alignment)
 * 
 * ZERO tolerância para dados de baixa qualidade em treino!
 */

import type { MetaLearningConfig } from "./meta-learning-config";

export interface QualityCheckResult {
  passed: boolean;
  score: number; // 0-100
  failures: string[]; // Lista de checks que falharam
  warnings: string[]; // Lista de warnings (passa mas com ressalvas)
  details: {
    lengthCheck: boolean;
    toxicityCheck: boolean;
    piiCheck: boolean;
    factualityCheck: boolean;
    coherenceCheck: boolean;
  };
}

export interface TrainingExample {
  instruction: string;
  input?: string;
  output: string;
  system?: string;
}

export class QualityGatesEnterprise {
  /**
   * GATE 1: Length & Format Validation
   */
  private checkLength(
    example: TrainingExample,
    config: MetaLearningConfig
  ): { passed: boolean; reason?: string } {
    const outputLen = example.output.length;
    const instructionLen = example.instruction.length;
    
    // Min length
    if (outputLen < config.qualityGates.minResponseLength) {
      return {
        passed: false,
        reason: `Output too short (${outputLen} < ${config.qualityGates.minResponseLength})`
      };
    }
    
    // Max length
    if (outputLen > config.qualityGates.maxResponseLength) {
      return {
        passed: false,
        reason: `Output too long (${outputLen} > ${config.qualityGates.maxResponseLength})`
      };
    }
    
    // Instruction minimum
    if (instructionLen < 5) {
      return {
        passed: false,
        reason: `Instruction too short (${instructionLen} < 5)`
      };
    }
    
    return { passed: true };
  }
  
  /**
   * GATE 2: Toxicity Detection (Content Safety)
   * 
   * Detecta conteúdo tóxico/ofensivo que não deve ser usado para treino:
   * - Hate speech
   * - Violence
   * - Sexual content
   * - Self-harm
   * - Profanity
   */
  private checkToxicity(example: TrainingExample): {
    passed: boolean;
    score: number; // 0 = clean, 100 = very toxic
    reason?: string;
  } {
    const text = `${example.instruction} ${example.output}`.toLowerCase();
    
    // Comprehensive toxicity patterns (enterprise-grade)
    const toxicPatterns = {
      // Hate speech & discrimination
      hate: /\b(hate|despise|loathe)\b.{0,20}\b(jews|muslims|christians|gays|blacks|whites|asians|latinos|women|men)\b/i,
      slurs: /\b(n[i1]gg[ae]r|f[a4]gg[o0]t|r[e3]t[a4]rd|ch[i1]nk|sp[i1]c|k[i1]ke|tr[a4]nny)\b/i,
      
      // Violence & harm
      violence: /\b(kill|murder|assassinate|torture|rape|assault|beat up|shoot|stab)\b.{0,30}\b(him|her|them|you|someone|people)\b/i,
      selfHarm: /\b(suicide|self-harm|cut myself|kill myself|end it all)\b/i,
      
      // Sexual content (explicit)
      sexual: /\b(fuck|pussy|cock|dick|penis|vagina|porn|sex|nude|naked)\b/i,
      
      // Profanity (moderate severity)
      profanity: /\b(shit|damn|hell|ass|bastard|bitch)\b/i,
      
      // Dangerous instructions
      dangerous: /\b(how to (make|build|create|construct)) (bomb|explosive|weapon|poison|drug)\b/i,
    };
    
    let toxicityScore = 0;
    const detectedPatterns: string[] = [];
    
    // Check each category
    for (const [category, pattern] of Object.entries(toxicPatterns)) {
      if (pattern.test(text)) {
        detectedPatterns.push(category);
        
        // Weight by severity
        switch (category) {
          case 'hate':
          case 'slurs':
          case 'violence':
          case 'dangerous':
            toxicityScore += 100; // Instant fail
            break;
          case 'selfHarm':
          case 'sexual':
            toxicityScore += 75; // High severity
            break;
          case 'profanity':
            toxicityScore += 25; // Moderate
            break;
        }
      }
    }
    
    toxicityScore = Math.min(100, toxicityScore);
    
    // Threshold: < 50 passes
    const passed = toxicityScore < 50;
    
    return {
      passed,
      score: toxicityScore,
      reason: passed ? undefined : `Toxicity detected: ${detectedPatterns.join(', ')}`
    };
  }
  
  /**
   * GATE 3: PII Detection (Privacy Protection)
   * 
   * Detecta PII que já deveria ter sido redacted:
   * - SSN
   * - Credit cards
   * - Phone numbers
   * - Email addresses
   * - Personal names (heuristic)
   */
  private checkPII(example: TrainingExample): {
    passed: boolean;
    piiFound: string[];
    reason?: string;
  } {
    const text = `${example.instruction} ${example.output}`;
    
    const piiPatterns = {
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      phone: /\b(\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g,
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      // Heuristic: Capitalized words that look like names
      // (simplificado - em produção usar NER como SpaCy)
      names: /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g,
    };
    
    const piiFound: string[] = [];
    
    for (const [type, pattern] of Object.entries(piiPatterns)) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        piiFound.push(`${type} (${matches.length}x)`);
      }
    }
    
    // Allow names in instruction (common) but warn
    // Fail on SSN, credit cards, phones, emails
    const criticalPII = piiFound.filter(p => 
      p.startsWith('ssn') || 
      p.startsWith('creditCard') ||
      p.startsWith('phone') ||
      p.startsWith('email')
    );
    
    const passed = criticalPII.length === 0;
    
    return {
      passed,
      piiFound,
      reason: passed ? undefined : `Critical PII found: ${criticalPII.join(', ')}`
    };
  }
  
  /**
   * GATE 4: Factuality Heuristics (Truthfulness)
   * 
   * Heurísticas para detectar possível desinformação:
   * - Statements sobre fatos verificáveis sem sources
   * - Absolute claims sem qualificadores
   * - Contradições internas
   */
  private checkFactuality(example: TrainingExample): {
    passed: boolean;
    warnings: string[];
  } {
    const output = example.output.toLowerCase();
    const warnings: string[] = [];
    
    // Red flags for misinformation
    const problematicPatterns = {
      // Absolute claims without qualifiers
      absoluteClaims: /(always|never|all|none|100%|everyone|no one)\b/gi,
      
      // Unverified medical/health claims
      medicalClaims: /\b(cure|guaranteed|miracle|proven to)\b.{0,50}\b(cancer|diabetes|covid|disease)\b/i,
      
      // Conspiracy language
      conspiracy: /\b(government (cover-up|conspiracy)|they don't want you to know|wake up|sheeple)\b/i,
      
      // Financial scams
      scam: /\b(guaranteed (profit|returns)|get rich quick|secret formula)\b/i,
    };
    
    for (const [type, pattern] of Object.entries(problematicPatterns)) {
      const matches = output.match(pattern);
      if (matches) {
        warnings.push(`${type}: "${matches[0]}"`);
      }
    }
    
    // Too many absolute claims = likely low quality
    const absoluteMatches = output.match(problematicPatterns.absoluteClaims);
    if (absoluteMatches && absoluteMatches.length > 5) {
      warnings.push('Excessive absolute claims');
    }
    
    // Fail on conspiracy/scam language
    const criticalWarnings = warnings.filter(w => 
      w.startsWith('conspiracy') || 
      w.startsWith('scam') ||
      w.startsWith('medicalClaims')
    );
    
    const passed = criticalWarnings.length === 0;
    
    return {
      passed,
      warnings,
    };
  }
  
  /**
   * GATE 5: Semantic Coherence (Instruction-Response Alignment)
   * 
   * Verifica se output responde à instruction de forma coerente:
   * - Output não deve ignorar completamente a instruction
   * - Output não deve ser genérico demais
   * - Output não deve ser repetitivo
   */
  private checkCoherence(example: TrainingExample): {
    passed: boolean;
    score: number; // 0-100
    reason?: string;
  } {
    const instruction = example.instruction.toLowerCase();
    const output = example.output.toLowerCase();
    
    // 1. Check if output is generic/boilerplate
    const genericPatterns = [
      /^(i apologize|i'm sorry|i cannot|i don't have|i'm not able)/,
      /^(thank you|thanks|you're welcome)/,
    ];
    
    for (const pattern of genericPatterns) {
      if (pattern.test(output)) {
        return {
          passed: false,
          score: 20,
          reason: 'Output is too generic/boilerplate'
        };
      }
    }
    
    // 2. Check if output is relevant (contains keywords from instruction)
    const instructionWords = instruction
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3); // Only significant words
    
    const relevantWords = instructionWords.filter(word => 
      output.includes(word)
    );
    
    const relevanceRatio = relevantWords.length / Math.max(1, instructionWords.length);
    
    if (relevanceRatio < 0.2) {
      return {
        passed: false,
        score: Math.round(relevanceRatio * 100),
        reason: `Low relevance (${(relevanceRatio * 100).toFixed(1)}% keywords matched)`
      };
    }
    
    // 3. Check for excessive repetition
    const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const uniqueSentences = new Set(sentences);
    const uniquenessRatio = uniqueSentences.size / Math.max(1, sentences.length);
    
    if (uniquenessRatio < 0.7) {
      return {
        passed: false,
        score: Math.round(uniquenessRatio * 100),
        reason: `Excessive repetition (${(uniquenessRatio * 100).toFixed(1)}% unique sentences)`
      };
    }
    
    // Passed: calculate composite score
    const score = Math.round((relevanceRatio * 50) + (uniquenessRatio * 50));
    
    return {
      passed: true,
      score,
    };
  }
  
  /**
   * RUN ALL QUALITY GATES - Master validation function
   */
  async validateExample(
    example: TrainingExample,
    config: MetaLearningConfig
  ): Promise<QualityCheckResult> {
    const failures: string[] = [];
    const warnings: string[] = [];
    
    // GATE 1: Length
    const lengthCheck = this.checkLength(example, config);
    if (!lengthCheck.passed && lengthCheck.reason) {
      failures.push(`Length: ${lengthCheck.reason}`);
    }
    
    // GATE 2: Toxicity
    const toxicityCheck = this.checkToxicity(example);
    if (!toxicityCheck.passed && toxicityCheck.reason) {
      failures.push(`Toxicity: ${toxicityCheck.reason}`);
    }
    
    // GATE 3: PII
    const piiCheck = this.checkPII(example);
    if (!piiCheck.passed && piiCheck.reason) {
      failures.push(`PII: ${piiCheck.reason}`);
    }
    if (piiCheck.piiFound.length > 0) {
      warnings.push(`PII detected: ${piiCheck.piiFound.join(', ')}`);
    }
    
    // GATE 4: Factuality
    const factualityCheck = this.checkFactuality(example);
    if (!factualityCheck.passed) {
      failures.push('Factuality: Likely misinformation');
    }
    warnings.push(...factualityCheck.warnings);
    
    // GATE 5: Coherence
    const coherenceCheck = this.checkCoherence(example);
    if (!coherenceCheck.passed && coherenceCheck.reason) {
      failures.push(`Coherence: ${coherenceCheck.reason}`);
    }
    
    // Calculate composite score (0-100)
    const baseScore = config.qualityGates.minQualityScore;
    let score = baseScore;
    
    // Deduct points for failures
    score -= failures.length * 20;
    
    // Bonus for passing all checks
    if (failures.length === 0) {
      score += toxicityCheck.score > 0 ? -toxicityCheck.score : 10;
      score += coherenceCheck.score || 0;
    }
    
    score = Math.max(0, Math.min(100, score));
    
    const passed = failures.length === 0 && score >= config.qualityGates.minQualityScore;
    
    return {
      passed,
      score,
      failures,
      warnings,
      details: {
        lengthCheck: lengthCheck.passed,
        toxicityCheck: toxicityCheck.passed,
        piiCheck: piiCheck.passed,
        factualityCheck: factualityCheck.passed,
        coherenceCheck: coherenceCheck.passed,
      },
    };
  }
  
  /**
   * Batch validation (for efficiency)
   */
  async validateBatch(
    examples: TrainingExample[],
    config: MetaLearningConfig
  ): Promise<{
    passed: TrainingExample[];
    failed: Array<{ example: TrainingExample; result: QualityCheckResult }>;
    stats: {
      total: number;
      passed: number;
      failed: number;
      passRate: number;
    };
  }> {
    const passed: TrainingExample[] = [];
    const failed: Array<{ example: TrainingExample; result: QualityCheckResult }> = [];
    
    for (const example of examples) {
      const result = await this.validateExample(example, config);
      
      if (result.passed) {
        passed.push(example);
      } else {
        failed.push({ example, result });
      }
    }
    
    return {
      passed,
      failed,
      stats: {
        total: examples.length,
        passed: passed.length,
        failed: failed.length,
        passRate: (passed.length / examples.length) * 100,
      },
    };
  }
}

// Singleton export
export const qualityGatesEnterprise = new QualityGatesEnterprise();
