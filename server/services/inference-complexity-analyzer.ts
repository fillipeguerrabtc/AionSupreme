/**
 * INFERENCE COMPLEXITY ANALYZER
 * ==============================
 * 
 * Analyzes inference requests and determines if GPU is needed.
 * 
 * 🎯 GPU TRIGGERS:
 * - Image generation (ALWAYS needs GPU)
 * - Complex semantic search in large KB (>1000 docs)
 * - RAG with heavy embedding computation
 * - Video processing
 * - Large batch inference
 * 
 * 🎯 NO GPU NEEDED:
 * - Simple chat (use free APIs)
 * - Small KB lookups
 * - Text-only queries without embeddings
 * - Web search fallback
 * 
 * CASCATA:
 * 1º GPU própria (se complexidade HIGH)
 * 2º APIs gratuitas (Groq, Gemini, HF)
 * 3º Web search
 * 4º OpenAI (último recurso)
 */

export type InferenceType = 
  | 'chat_simple'           // Simple chat, no KB
  | 'chat_kb_lookup'        // Chat with KB lookup
  | 'semantic_search'       // Semantic search in KB
  | 'image_generation'      // Generate images
  | 'video_processing'      // Process videos
  | 'batch_inference'       // Batch processing
  | 'rag_heavy';            // Heavy RAG with embeddings

export type ComplexityLevel = 'low' | 'medium' | 'high' | 'critical';

export type ResourceDecision = 
  | 'gpu_required'          // Must use GPU
  | 'gpu_preferred'         // GPU recommended but not required
  | 'free_api_sufficient'   // Free APIs can handle it
  | 'web_search_fallback';  // Use web search

interface InferenceAnalysis {
  type: InferenceType;
  complexity: ComplexityLevel;
  decision: ResourceDecision;
  reason: string;
  estimatedTokens?: number;
  estimatedDurationSeconds?: number;
  shouldTriggerGPU: boolean;
}

interface InferenceRequest {
  userMessage: string;
  hasKBContext: boolean;
  kbDocumentCount?: number;
  requiresEmbeddings?: boolean;
  requiresImageGeneration?: boolean;
  requiresVideoProcessing?: boolean;
  batchSize?: number;
}

export class InferenceComplexityAnalyzer {
  
  private readonly KB_LARGE_THRESHOLD = 1000; // >1000 docs = large KB
  private readonly BATCH_LARGE_THRESHOLD = 50; // >50 items = large batch
  
  /**
   * Analyze inference request and determine resource needs
   */
  analyzeRequest(request: InferenceRequest): InferenceAnalysis {
    
    // CRITICAL: Image generation ALWAYS needs GPU
    if (request.requiresImageGeneration) {
      return {
        type: 'image_generation',
        complexity: 'critical',
        decision: 'gpu_required',
        reason: '🎨 Image generation requires GPU (Stable Diffusion)',
        estimatedDurationSeconds: 30,
        shouldTriggerGPU: true,
      };
    }
    
    // CRITICAL: Video processing ALWAYS needs GPU
    if (request.requiresVideoProcessing) {
      return {
        type: 'video_processing',
        complexity: 'critical',
        decision: 'gpu_required',
        reason: '🎥 Video processing requires GPU acceleration',
        estimatedDurationSeconds: 120,
        shouldTriggerGPU: true,
      };
    }
    
    // HIGH: Large batch inference
    if (request.batchSize && request.batchSize >= this.BATCH_LARGE_THRESHOLD) {
      return {
        type: 'batch_inference',
        complexity: 'high',
        decision: 'gpu_preferred',
        reason: `📦 Large batch (${request.batchSize} items) - GPU recommended`,
        estimatedDurationSeconds: request.batchSize * 2,
        shouldTriggerGPU: true,
      };
    }
    
    // HIGH: Complex RAG with large KB
    if (request.hasKBContext && request.requiresEmbeddings) {
      const docCount = request.kbDocumentCount || 0;
      
      if (docCount >= this.KB_LARGE_THRESHOLD) {
        return {
          type: 'rag_heavy',
          complexity: 'high',
          decision: 'gpu_preferred',
          reason: `🔍 Large KB semantic search (${docCount} docs) - GPU recommended`,
          estimatedTokens: docCount * 100,
          estimatedDurationSeconds: Math.ceil(docCount / 50),
          shouldTriggerGPU: true,
        };
      } else {
        // Medium KB - free APIs can handle
        return {
          type: 'semantic_search',
          complexity: 'medium',
          decision: 'free_api_sufficient',
          reason: `✅ Medium KB search (${docCount} docs) - Free APIs sufficient`,
          estimatedTokens: docCount * 50,
          estimatedDurationSeconds: 5,
          shouldTriggerGPU: false,
        };
      }
    }
    
    // MEDIUM: KB lookup without embeddings
    if (request.hasKBContext && !request.requiresEmbeddings) {
      return {
        type: 'chat_kb_lookup',
        complexity: 'medium',
        decision: 'free_api_sufficient',
        reason: '✅ KB lookup (no embeddings) - Free APIs sufficient',
        estimatedTokens: 2000,
        estimatedDurationSeconds: 3,
        shouldTriggerGPU: false,
      };
    }
    
    // LOW: Simple chat (no KB, no special processing)
    return {
      type: 'chat_simple',
      complexity: 'low',
      decision: 'free_api_sufficient',
      reason: '✅ Simple chat - Free APIs sufficient',
      estimatedTokens: 1000,
      estimatedDurationSeconds: 2,
      shouldTriggerGPU: false,
    };
  }
  
  /**
   * Detect if user message requires image generation
   */
  detectImageGenerationIntent(userMessage: string): boolean {
    const imageKeywords = [
      'gerar imagem',
      'criar imagem',
      'desenhar',
      'ilustrar',
      'generate image',
      'create image',
      'draw',
      'make a picture',
      'visualize',
      'show me a picture',
    ];
    
    const messageLower = userMessage.toLowerCase();
    return imageKeywords.some(keyword => messageLower.includes(keyword));
  }
  
  /**
   * Detect if user message requires video processing
   */
  detectVideoProcessingIntent(userMessage: string): boolean {
    const videoKeywords = [
      'processar vídeo',
      'analisar vídeo',
      'extrair frames',
      'process video',
      'analyze video',
      'extract frames',
      'video summary',
      'transcrever vídeo',
    ];
    
    const messageLower = userMessage.toLowerCase();
    return videoKeywords.some(keyword => messageLower.includes(keyword));
  }
  
  /**
   * Detect if query requires heavy semantic search
   */
  detectSemanticSearchIntent(userMessage: string): boolean {
    const semanticKeywords = [
      'buscar na base',
      'procurar documentos',
      'encontrar similar',
      'search in kb',
      'find documents',
      'similar to',
      'semantic search',
      'busca semântica',
      'relacionado a',
    ];
    
    const messageLower = userMessage.toLowerCase();
    return semanticKeywords.some(keyword => messageLower.includes(keyword));
  }
  
  /**
   * Quick check: Should trigger GPU for this request?
   */
  async shouldTriggerGPU(request: InferenceRequest): Promise<{ shouldTrigger: boolean; reason: string }> {
    const analysis = this.analyzeRequest(request);
    
    if (analysis.shouldTriggerGPU) {
      // Additional check: Is GPU available?
      const gpuAvailable = await this.checkGPUAvailability();
      
      if (!gpuAvailable.available) {
        return {
          shouldTrigger: false,
          reason: `⚠️ ${analysis.reason} BUT ${gpuAvailable.reason}`,
        };
      }
      
      return {
        shouldTrigger: true,
        reason: analysis.reason,
      };
    }
    
    return {
      shouldTrigger: false,
      reason: analysis.reason,
    };
  }
  
  /**
   * Check if GPU resources are available
   */
  private async checkGPUAvailability(): Promise<{ available: boolean; reason: string }> {
    // Import db dynamically to avoid circular dependencies
    const { db } = await import('../db');
    const { gpuWorkers } = await import('../../shared/schema');
    const { sql } = await import('drizzle-orm');
    
    // Check if any GPU is online
    const onlineGPUs = await db.query.gpuWorkers.findMany({
      where: sql`status IN ('online', 'healthy')`,
    });
    
    if (onlineGPUs.length > 0) {
      return {
        available: true,
        reason: `${onlineGPUs.length} GPU(s) online`,
      };
    }
    
    // Check Kaggle quota
    const kaggleWorkers = await db.query.gpuWorkers.findMany({
      where: sql`provider = 'kaggle'`,
    });
    
    if (kaggleWorkers.length > 0) {
      const totalWeeklyUsage = kaggleWorkers.reduce((sum, w) => sum + (w.weeklyUsageHours || 0), 0);
      
      if (totalWeeklyUsage < 28) {
        return {
          available: true,
          reason: `Kaggle quota available (${(28 - totalWeeklyUsage).toFixed(1)}h remaining)`,
        };
      } else {
        return {
          available: false,
          reason: 'Kaggle weekly quota exhausted (28h/week)',
        };
      }
    }
    
    // Check Colab cooldown
    const colabWorkers = await db.query.gpuWorkers.findMany({
      where: sql`provider = 'colab'`,
    });
    
    if (colabWorkers.length > 0) {
      const colab = colabWorkers[0];
      const now = new Date();
      
      if (!colab.cooldownUntil || now >= new Date(colab.cooldownUntil)) {
        return {
          available: true,
          reason: 'Colab cooldown elapsed - can start',
        };
      } else {
        const cooldownEnd = new Date(colab.cooldownUntil);
        const remainingHours = (cooldownEnd.getTime() - now.getTime()) / (1000 * 3600);
        return {
          available: false,
          reason: `Colab in cooldown (${remainingHours.toFixed(1)}h remaining)`,
        };
      }
    }
    
    return {
      available: false,
      reason: 'No GPU workers configured',
    };
  }
  
  /**
   * Get recommended resource allocation for request
   */
  async getRecommendedResource(request: InferenceRequest): Promise<{
    resource: 'gpu' | 'free_api' | 'web_search' | 'openai';
    provider?: string;
    reason: string;
  }> {
    const analysis = this.analyzeRequest(request);
    
    switch (analysis.decision) {
      case 'gpu_required':
      case 'gpu_preferred':
        const gpuCheck = await this.checkGPUAvailability();
        if (gpuCheck.available) {
          return {
            resource: 'gpu',
            provider: 'kaggle_or_colab',
            reason: `${analysis.reason} → Using GPU`,
          };
        } else {
          // Fallback to free APIs if GPU not available
          return {
            resource: 'free_api',
            reason: `${analysis.reason} → GPU unavailable, fallback to Free APIs`,
          };
        }
      
      case 'free_api_sufficient':
        return {
          resource: 'free_api',
          reason: analysis.reason,
        };
      
      case 'web_search_fallback':
        return {
          resource: 'web_search',
          reason: analysis.reason,
        };
      
      default:
        return {
          resource: 'free_api',
          reason: 'Default to free APIs',
        };
    }
  }
  
  /**
   * Get analysis statistics
   */
  getAnalysisStats(): {
    kbLargeThreshold: number;
    batchLargeThreshold: number;
  } {
    return {
      kbLargeThreshold: this.KB_LARGE_THRESHOLD,
      batchLargeThreshold: this.BATCH_LARGE_THRESHOLD,
    };
  }
}

// Singleton instance
export const inferenceComplexityAnalyzer = new InferenceComplexityAnalyzer();
