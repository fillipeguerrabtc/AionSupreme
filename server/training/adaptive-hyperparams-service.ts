/**
 * ADAPTIVE HYPERPARAMETERS - Dynamic Training Optimization
 * 
 * Ajusta automaticamente hyperparameters baseado em performance:
 * - Learning rate decay/warmup
 * - Batch size adaptation
 * - Epochs baseado em convergência
 * - Gradient accumulation steps
 * 
 * ALGORITMOS:
 * - Cosine Annealing with Warm Restarts (Loshchilov & Hutter, 2017)
 * - ReduceLROnPlateau (Keras-style)
 * - Adaptive batch sizing (Smith et al., 2018)
 */

import type { MetaLearningConfig } from "./meta-learning-config";

export interface TrainingMetrics {
  step: number;
  epoch: number;
  loss: number;
  validationLoss?: number;
  gradientNorm: number;
}

export interface AdaptiveParams {
  learningRate: number;
  batchSize: number;
  epochs: number;
  gradientAccumulationSteps: number;
  reason: string; // Why these params were chosen
}

export class AdaptiveHyperparamsService {
  private lossHistory: number[] = [];
  private gradientNormHistory: number[] = [];
  private currentLR: number = 0;
  private patience = 3; // Steps without improvement before LR reduction
  private noImprovementCount = 0;
  private bestLoss = Infinity;
  
  /**
   * Initialize with base configuration
   */
  initialize(config: MetaLearningConfig): void {
    this.currentLR = config.training.learningRate;
    this.lossHistory = [];
    this.gradientNormHistory = [];
    this.noImprovementCount = 0;
    this.bestLoss = Infinity;
    
    console.log(`[AdaptiveHyperparams] Initialized with base LR: ${this.currentLR}`);
  }
  
  /**
   * Compute adaptive learning rate based on training progress
   * 
   * Strategies:
   * 1. Cosine Annealing: LR oscila em cosine wave
   * 2. ReduceLROnPlateau: Reduz LR quando loss estagna
   * 3. Warmup: LR gradual no início
   */
  computeAdaptiveLR(
    metrics: TrainingMetrics,
    config: MetaLearningConfig,
    strategy: 'cosine' | 'plateau' | 'warmup' = 'plateau'
  ): number {
    const baseLR = config.training.learningRate;
    const warmupSteps = config.training.warmupSteps;
    
    // STRATEGY 1: Warmup (primeiros steps)
    if (metrics.step < warmupSteps) {
      const warmupLR = (baseLR * metrics.step) / warmupSteps;
      console.log(`[AdaptiveHyperparams] Warmup LR: ${warmupLR.toExponential(2)}`);
      return warmupLR;
    }
    
    // STRATEGY 2: Cosine Annealing
    if (strategy === 'cosine') {
      const totalSteps = config.training.epochs * 100; // Estimate
      const progress = Math.min(1.0, metrics.step / totalSteps);
      const cosineLR = baseLR * (1 + Math.cos(Math.PI * progress)) / 2;
      return Math.max(baseLR * 0.01, cosineLR); // Min LR = 1% of base
    }
    
    // STRATEGY 3: ReduceLROnPlateau (default - mais estável)
    this.lossHistory.push(metrics.loss);
    
    // Check if loss improved
    if (metrics.loss < this.bestLoss - 0.001) {
      this.bestLoss = metrics.loss;
      this.noImprovementCount = 0;
    } else {
      this.noImprovementCount++;
    }
    
    // Reduce LR if no improvement for `patience` steps
    if (this.noImprovementCount >= this.patience) {
      const newLR = this.currentLR * 0.5; // Halve LR
      console.log(`[AdaptiveHyperparams] 📉 Reducing LR: ${this.currentLR.toExponential(2)} → ${newLR.toExponential(2)}`);
      console.log(`   Reason: No improvement for ${this.patience} steps`);
      this.currentLR = Math.max(baseLR * 0.001, newLR); // Min LR = 0.1% of base
      this.noImprovementCount = 0;
    }
    
    return this.currentLR;
  }
  
  /**
   * Compute adaptive batch size based on gradient stability
   * 
   * Larger batches = more stable gradients but slower updates
   * Smaller batches = faster exploration but noisier
   */
  computeAdaptiveBatchSize(
    metrics: TrainingMetrics,
    config: MetaLearningConfig
  ): number {
    const baseBatchSize = config.training.batchSize;
    this.gradientNormHistory.push(metrics.gradientNorm);
    
    // Only adapt after collecting enough data
    if (this.gradientNormHistory.length < 10) {
      return baseBatchSize;
    }
    
    // Calculate gradient variance (last 10 steps)
    const recentNorms = this.gradientNormHistory.slice(-10);
    const mean = recentNorms.reduce((a, b) => a + b, 0) / recentNorms.length;
    const variance = recentNorms.reduce((sum, norm) => sum + Math.pow(norm - mean, 2), 0) / recentNorms.length;
    const stdDev = Math.sqrt(variance);
    
    // High variance = reduce batch size (more exploration)
    // Low variance = increase batch size (more efficiency)
    const stabilityRatio = stdDev / (mean + 1e-8);
    
    let newBatchSize = baseBatchSize;
    
    if (stabilityRatio > 0.5) {
      // Very noisy gradients → reduce batch size
      newBatchSize = Math.max(1, Math.floor(baseBatchSize * 0.75));
      console.log(`[AdaptiveHyperparams] 📉 Reducing batch size: ${baseBatchSize} → ${newBatchSize} (high gradient variance)`);
    } else if (stabilityRatio < 0.1) {
      // Very stable gradients → increase batch size
      newBatchSize = Math.min(baseBatchSize * 2, Math.floor(baseBatchSize * 1.5));
      console.log(`[AdaptiveHyperparams] 📈 Increasing batch size: ${baseBatchSize} → ${newBatchSize} (low gradient variance)`);
    }
    
    return newBatchSize;
  }
  
  /**
   * Determine optimal epochs based on convergence
   * 
   * Early stopping if loss stops improving
   */
  shouldStopTraining(
    metrics: TrainingMetrics,
    config: MetaLearningConfig
  ): {
    shouldStop: boolean;
    reason?: string;
  } {
    const maxEpochs = config.training.epochs;
    
    // Max epochs reached
    if (metrics.epoch >= maxEpochs) {
      return {
        shouldStop: true,
        reason: `Max epochs (${maxEpochs}) reached`
      };
    }
    
    // Need at least 5 epochs of data
    if (this.lossHistory.length < 5) {
      return { shouldStop: false };
    }
    
    // Check if loss is converged (no improvement in last 5 epochs)
    const recentLosses = this.lossHistory.slice(-5);
    const avgRecentLoss = recentLosses.reduce((a, b) => a + b, 0) / recentLosses.length;
    const improvement = (this.lossHistory[0] - avgRecentLoss) / this.lossHistory[0];
    
    if (improvement < 0.01) {
      // Less than 1% improvement → converged
      return {
        shouldStop: true,
        reason: `Converged (${(improvement * 100).toFixed(2)}% improvement in last 5 epochs)`
      };
    }
    
    return { shouldStop: false };
  }
  
  /**
   * Compute ALL adaptive parameters at once
   */
  computeAdaptiveParams(
    metrics: TrainingMetrics,
    config: MetaLearningConfig
  ): AdaptiveParams {
    const learningRate = this.computeAdaptiveLR(metrics, config);
    const batchSize = this.computeAdaptiveBatchSize(metrics, config);
    const stopCheck = this.shouldStopTraining(metrics, config);
    
    // Gradient accumulation adapts to batch size changes
    const targetBatchSize = config.training.batchSize;
    const gradientAccumulationSteps = Math.ceil(targetBatchSize / batchSize);
    
    let reason = 'Adaptive parameters computed';
    if (stopCheck.shouldStop) {
      reason = `Early stopping: ${stopCheck.reason}`;
    }
    
    return {
      learningRate,
      batchSize,
      epochs: stopCheck.shouldStop ? metrics.epoch : config.training.epochs,
      gradientAccumulationSteps,
      reason,
    };
  }
  
  /**
   * Get training statistics
   */
  getStats(): {
    lossHistory: number[];
    currentLR: number;
    bestLoss: number;
    noImprovementCount: number;
  } {
    return {
      lossHistory: [...this.lossHistory],
      currentLR: this.currentLR,
      bestLoss: this.bestLoss,
      noImprovementCount: this.noImprovementCount,
    };
  }
}

// Singleton export
export const adaptiveHyperparamsService = new AdaptiveHyperparamsService();
