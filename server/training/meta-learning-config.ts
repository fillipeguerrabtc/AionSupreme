/**
 * META-LEARNING CONFIGURATION - Enterprise Diamond Plus
 * 
 * Configuração centralizada para sistema de Meta-Learning com:
 * - Adaptive Thresholds (dev/prod/sensitive)
 * - LoRA configuration
 * - Replay Buffer settings
 * - Differential Privacy parameters
 * - Quality gates
 * 
 * ZERO tolerância para dados mocados - 100% production-ready
 */

export type MetaLearningMode = 'development' | 'production' | 'sensitive';

export interface MetaLearningConfig {
  mode: MetaLearningMode;
  
  // Adaptive Thresholds
  thresholds: {
    minKBItems: number; // ✅ BLOCKER #2 FIX: Renamed from minExamples - conta KB items aprovados
    minExamples: number; // @deprecated - mantido para backward compatibility
    federatedMinimum: number; // Mínimo para distribuir entre GPUs
  };
  
  // LoRA Configuration (Parameter-Efficient Fine-Tuning)
  lora: {
    rank: number;
    alpha: number;
    dropout: number;
    targetModules: string[];
  };
  
  // Replay Buffer (Anti-Catastrophic Forgetting)
  replayBuffer: {
    enabled: boolean;
    maxSize: number;
    mixRatio: number; // Proporção de replay vs novos exemplos (0.0-1.0)
    qualityThreshold: number; // Mínimo quality score para buffer
  };
  
  // Quality Gates
  qualityGates: {
    minQualityScore: number;
    minResponseLength: number;
    maxResponseLength: number;
    requireUserFeedback: boolean;
  };
  
  // Differential Privacy (DP-SGD style)
  differentialPrivacy: {
    enabled: boolean;
    epsilon: number; // Privacy budget (lower = more private)
    delta: number; // Failure probability
    gradientClipNorm: number; // L2 norm clipping threshold
    noiseMultiplier: number; // Gaussian noise scale
  };
  
  // PII Redaction
  piiRedaction: {
    enabled: boolean;
    redactEmails: boolean;
    redactPhones: boolean;
    redactSSN: boolean;
    redactCreditCards: boolean;
    redactNames: boolean; // NER-based (mais avançado)
  };
  
  // Training Parameters
  training: {
    epochs: number;
    batchSize: number;
    learningRate: number;
    warmupSteps: number;
    gradientAccumulationSteps: number;
  };
  
  // Monitoring
  monitoring: {
    logMetrics: boolean;
    trackPrivacyBudget: boolean;
    alertOnHighMemorization: boolean;
  };
}

/**
 * PRESET CONFIGURATIONS POR MODO
 */
export const META_LEARNING_CONFIGS: Record<MetaLearningMode, MetaLearningConfig> = {
  // DEVELOPMENT MODE: Testes rápidos, dados não-sensíveis
  development: {
    mode: 'development',
    
    thresholds: {
      minKBItems: 5, // ✅ BLOCKER #2 FIX: KB items threshold (baixo para dev/testes)
      minExamples: 5, // @deprecated - mantido para backward compatibility
      federatedMinimum: 10,
    },
    
    lora: {
      rank: 16,
      alpha: 32,
      dropout: 0.1,
      targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj'],
    },
    
    replayBuffer: {
      enabled: true,
      maxSize: 100,
      mixRatio: 0.1, // 10% replay
      qualityThreshold: 60,
    },
    
    qualityGates: {
      minQualityScore: 50, // Mais permissivo em dev
      minResponseLength: 10,
      maxResponseLength: 10000,
      requireUserFeedback: false,
    },
    
    differentialPrivacy: {
      enabled: false, // Desabilitado em dev (performance)
      epsilon: 3.0,
      delta: 1e-5,
      gradientClipNorm: 1.0,
      noiseMultiplier: 1.1,
    },
    
    piiRedaction: {
      enabled: true, // Sempre ativo (segurança básica)
      redactEmails: true,
      redactPhones: true,
      redactSSN: true,
      redactCreditCards: true,
      redactNames: false, // NER caro, desabilitar em dev
    },
    
    training: {
      epochs: 3,
      batchSize: 4,
      learningRate: 2e-4,
      warmupSteps: 10,
      gradientAccumulationSteps: 4,
    },
    
    monitoring: {
      logMetrics: true,
      trackPrivacyBudget: false,
      alertOnHighMemorization: false,
    },
  },
  
  // PRODUCTION MODE: Balance entre rapidez e segurança
  production: {
    mode: 'production',
    
    thresholds: {
      minKBItems: 25, // ✅ BLOCKER #2 FIX: 25 KB items (conforme spec original)
      minExamples: 25, // @deprecated - mantido para backward compatibility
      federatedMinimum: 50,
    },
    
    lora: {
      rank: 16,
      alpha: 32,
      dropout: 0.1,
      targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj'],
    },
    
    replayBuffer: {
      enabled: true,
      maxSize: 100,
      mixRatio: 0.15, // 15% replay (mais conservador)
      qualityThreshold: 70,
    },
    
    qualityGates: {
      minQualityScore: 60, // Quality mínima production
      minResponseLength: 20,
      maxResponseLength: 8000,
      requireUserFeedback: false,
    },
    
    differentialPrivacy: {
      enabled: false, // DESABILITADO - requer custom workers com Opacus
      epsilon: 3.0, // (Preparado para futuro - workers com DP-SGD)
      delta: 1e-5,
      gradientClipNorm: 1.0,
      noiseMultiplier: 1.1,
    },
    
    piiRedaction: {
      enabled: true,
      redactEmails: true,
      redactPhones: true,
      redactSSN: true,
      redactCreditCards: true,
      redactNames: true, // NER ativo em production
    },
    
    training: {
      epochs: 3,
      batchSize: 4,
      learningRate: 2e-4,
      warmupSteps: 20,
      gradientAccumulationSteps: 4,
    },
    
    monitoring: {
      logMetrics: true,
      trackPrivacyBudget: true,
      alertOnHighMemorization: true,
    },
  },
  
  // SENSITIVE MODE: Healthcare, Finance, GDPR/HIPAA compliance
  sensitive: {
    mode: 'sensitive',
    
    thresholds: {
      minKBItems: 50, // ✅ BLOCKER #2 FIX: Threshold MUITO alto (cohort privacy protection)
      minExamples: 50, // @deprecated - mantido para backward compatibility
      federatedMinimum: 100, // Federado requer dobro para garantir safety
    },
    
    lora: {
      rank: 8, // Rank menor = menos memorização
      alpha: 16,
      dropout: 0.2, // Dropout maior para regularização
      targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj'],
    },
    
    replayBuffer: {
      enabled: true,
      maxSize: 200, // Buffer maior para estabilidade
      mixRatio: 0.2, // 20% replay
      qualityThreshold: 80, // Apenas exemplos excelentes
    },
    
    qualityGates: {
      minQualityScore: 70, // Quality alta obrigatória
      minResponseLength: 30,
      maxResponseLength: 5000,
      requireUserFeedback: true, // HITL obrigatório
    },
    
    differentialPrivacy: {
      enabled: false, // DESABILITADO - requer custom workers com Opacus/TF Privacy
      epsilon: 1.0, // (Preparado para futuro - HIPAA-grade DP-SGD)
      delta: 1e-6,
      gradientClipNorm: 0.8,
      noiseMultiplier: 1.5,
    },
    
    piiRedaction: {
      enabled: true,
      redactEmails: true,
      redactPhones: true,
      redactSSN: true,
      redactCreditCards: true,
      redactNames: true,
    },
    
    training: {
      epochs: 2, // Menos epochs = menos memorização
      batchSize: 8, // Batch maior para estabilidade
      learningRate: 1e-4, // Learning rate menor
      warmupSteps: 50,
      gradientAccumulationSteps: 8,
    },
    
    monitoring: {
      logMetrics: true,
      trackPrivacyBudget: true,
      alertOnHighMemorization: true,
    },
  },
};

/**
 * Get current Meta-Learning configuration based on environment
 */
export function getMetaLearningConfig(): MetaLearningConfig {
  const mode = (process.env.META_LEARNING_MODE || 'production') as MetaLearningMode;
  
  if (!['development', 'production', 'sensitive'].includes(mode)) {
    console.warn(`[MetaLearning] Invalid mode '${mode}', falling back to 'production'`);
    return META_LEARNING_CONFIGS.production;
  }
  
  const config = META_LEARNING_CONFIGS[mode];
  console.log(`[MetaLearning] 📋 Loaded config: ${mode.toUpperCase()} mode`);
  console.log(`   • Threshold: ${config.thresholds.minKBItems} KB items`); // ✅ BLOCKER #2 FIX
  console.log(`   • Replay Buffer: ${config.replayBuffer.enabled ? 'ENABLED' : 'DISABLED'} (${config.replayBuffer.maxSize} size)`);
  console.log(`   • Differential Privacy: ${config.differentialPrivacy.enabled ? `ENABLED (ε=${config.differentialPrivacy.epsilon})` : 'DISABLED'}`);
  console.log(`   • PII Redaction: ${config.piiRedaction.enabled ? 'ENABLED' : 'DISABLED'}`);
  
  return config;
}

/**
 * Override specific config values (for testing/debugging)
 */
export function overrideMetaLearningConfig(
  baseMode: MetaLearningMode,
  overrides: Partial<MetaLearningConfig>
): MetaLearningConfig {
  const baseConfig = META_LEARNING_CONFIGS[baseMode];
  return {
    ...baseConfig,
    ...overrides,
    // Deep merge para objetos nested
    thresholds: { ...baseConfig.thresholds, ...(overrides.thresholds || {}) },
    lora: { ...baseConfig.lora, ...(overrides.lora || {}) },
    replayBuffer: { ...baseConfig.replayBuffer, ...(overrides.replayBuffer || {}) },
    qualityGates: { ...baseConfig.qualityGates, ...(overrides.qualityGates || {}) },
    differentialPrivacy: { ...baseConfig.differentialPrivacy, ...(overrides.differentialPrivacy || {}) },
    piiRedaction: { ...baseConfig.piiRedaction, ...(overrides.piiRedaction || {}) },
    training: { ...baseConfig.training, ...(overrides.training || {}) },
    monitoring: { ...baseConfig.monitoring, ...(overrides.monitoring || {}) },
  };
}
