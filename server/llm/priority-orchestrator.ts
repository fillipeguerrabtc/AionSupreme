/**
 * AION Supreme - Priority Orchestrator
 * NOVA ORDEM OBRIGATÓRIA (GPU-FIRST ARCHITECTURE):
 * 1. Knowledge Base (RAG) → Se encontrar: Ativa GPU → Inferência → Desliga GPU
 * 2. Web Search → Se encontrar: Ativa GPU → Inferência → Desliga GPU → Curadoria HITL
 * 3. Free APIs (Groq → Gemini → HF → OpenRouter) com auto-fallback
 * 4. OpenAI (último recurso, pago) com auto-fallback
 * 
 * REGRAS GPU:
 * - GPU SEMPRE desliga imediatamente após inferência completar
 * - Web search NUNCA usa APIs externas (usa GPU própria para processar)
 * - Prioriza recursos internos (GPU + Web) antes de consumir APIs externas
 */

import { semanticSearch, searchWithConfidence, type SearchResult } from '../ai/rag-service';
import { generateWithFreeAPIs, type LLMRequest, type LLMResponse } from './free-apis';
import { detectRefusal, isHighConfidenceRefusal } from './refusal-detector';
import { searchWeb } from '../learn/web-search';
import { indexDocumentComplete } from '../ai/knowledge-indexer';
import { agentTools } from '../agent/tools';
import { db } from '../db';
import { documents, curationQueue } from '@shared/schema';
import { sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { trackTokenUsage, type KBMetadata } from '../monitoring/token-tracker';
import { z } from 'zod';
import { GPUPool } from '../gpu/pool';
import { autoLearningListener } from '../events/auto-learning-listener';
import { storage } from '../storage';
import { log } from '../utils/logger';

// ============================================================================
// TYPES & VALIDATION
// ============================================================================

// Zod schema for web search metadata validation
const WebSearchMetadataSchema = z.object({
  query: z.string(),
  sources: z.array(z.object({
    url: z.string().url(),
    title: z.string(),
    snippet: z.string(),
    domain: z.string()
  })),
  resultsCount: z.number().int().min(0),
  indexedDocuments: z.number().int().min(0),
  // GPU usage tracking
  gpuUsed: z.boolean().optional(), // Indicates if GPU was activated for processing
  processingMode: z.enum(['web-only', 'web-gpu']).optional() // Processing mode
});

export type WebSearchMetadata = z.infer<typeof WebSearchMetadataSchema>;

export interface PriorityRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  unrestricted?: boolean;  // UNRESTRICTED mode = bypasses all filters
  forcedSource?: 'web' | 'kb' | 'free-apis';  // Force specific source when user explicitly requests it
  language?: "pt-BR" | "en-US" | "es-ES";  // 🔥 FIX: Language for response generation
}

export interface PriorityResponse {
  content: string;
  source: 'kb' | 'free-api' | 'web-fallback' | 'openai' | 'openai-fallback';
  provider?: string;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  attachments?: Array<{  // Multimodal attachments from KB
    type: "image" | "video" | "document";
    url: string;
    filename: string;
    mimeType: string;
    size?: number;
  }>;
  metadata?: {
    kbResults?: number;
    kbConfidence?: number;
    refusalDetected?: boolean;
    webSearchPerformed?: boolean;
    documentsIndexed?: number;
    explicitRequestFulfilled?: boolean;
    noAPIConsumption?: boolean;
    greetingIntercepted?: boolean;
  };
}

// ============================================================================
// HELPER: Run GPU Inference with Auto-Shutdown
// ============================================================================

// Singleton instance of DemandBasedKaggleOrchestrator (cached to prevent multiple starts)
let _demandKaggleOrchestrator: any = null;

async function getDemandKaggleOrchestrator() {
  if (!_demandKaggleOrchestrator) {
    const { DemandBasedKaggleOrchestrator } = await import('../services/demand-based-kaggle-orchestrator');
    _demandKaggleOrchestrator = new DemandBasedKaggleOrchestrator();
  }
  return _demandKaggleOrchestrator;
}

/**
 * Executes inference using GPU with automatic shutdown after completion.
 * This is the CORE helper for GPU-first architecture.
 * 
 * @param messages - Conversation messages for inference
 * @param options - Inference options (temperature, maxTokens, etc)
 * @returns Inference response or null if GPU unavailable/failed
 */
async function runGpuInference(
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  } = {}
): Promise<{ content: string; workerId: number; latencyMs: number } | null> {
  log.info({ component: 'gpu-inference' }, 'Attempting GPU inference');
  
  try {
    const { gpuLoadBalancer } = await import('../gpu/load-balancer');
    
    const gpuResult = await gpuLoadBalancer.executeLLMRequest(
      messages,
      {
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
        stream: false
      }
    );
    
    if (!gpuResult.success || !gpuResult.response) {
      console.log(`   ⚠️ GPU inference failed: ${gpuResult.error || 'Unknown error'}`);
      return null;
    }
    
    console.log(`   ✅ GPU inference successful (Worker ${gpuResult.workerId}, ${gpuResult.latencyMs}ms)`);
    
    // Track GPU usage (FREE, no cost) - wrapped in try/catch to prevent tracking errors from aborting valid responses
    try {
      await trackTokenUsage({
        provider: 'gpu-internal' as any,
        model: (gpuResult as any).model || 'kaggle-llm',
        promptTokens: (gpuResult as any).tokenUsage?.promptTokens || 0,
        completionTokens: (gpuResult as any).tokenUsage?.completionTokens || 0,
        totalTokens: ((gpuResult as any).tokenUsage?.promptTokens || 0) + ((gpuResult as any).tokenUsage?.completionTokens || 0),
        cost: 0, // GPU is FREE
        requestType: 'chat',
        success: true,
        metadata: {
          workerId: gpuResult.workerId,
          latencyMs: gpuResult.latencyMs
        } as any
      });
    } catch (trackError: any) {
      // Non-fatal: log tracking error but don't abort successful GPU response
      console.warn(`   ⚠️ GPU usage tracking failed (non-fatal): ${trackError.message}`);
    }
    
    return {
      content: gpuResult.response,
      workerId: gpuResult.workerId || 0,
      latencyMs: gpuResult.latencyMs || 0
    };
  } catch (error: any) {
    console.error(`   ❌ GPU inference error: ${error.message}`);
    return null;
  } finally {
    // CRITICAL: Auto-shutdown GPU immediately after inference (success or failure)
    try {
      const orchestrator = await getDemandKaggleOrchestrator();
      console.log('   🔌 Triggering GPU auto-shutdown...');
      const stopResult = await orchestrator.stopSession();
      if (stopResult.success) {
        console.log('   ✅ GPU session stopped successfully');
      } else {
        console.warn(`   ⚠️ GPU stop warning: ${stopResult.error}`);
      }
    } catch (stopError: any) {
      // Log but don't throw - shutdown is best-effort
      console.error(`   ⚠️ GPU shutdown error (non-fatal): ${stopError.message}`);
    }
  }
}

// ============================================================================
// HELPER: Detect Time-Sensitive Queries
// ============================================================================

function isTimeSensitiveQuery(query: string): boolean {
  const lowercaseQuery = query.toLowerCase();
  const timeSensitiveKeywords = [
    'price', 'preço', 'valor', 'cost', 'custo',
    'today', 'hoje', 'now', 'agora', 'current', 'atual',
    'latest', 'recente', 'recent', 'último',
    'weather', 'tempo', 'clima',
    'news', 'notícias', 'noticia',
    'bitcoin', 'btc', 'crypto', 'stock', 'ação', 'ações',
    'score', 'placar', 'result', 'resultado',
    'exchange', 'câmbio', 'dólar', 'dollar', 'euro'
  ];
  
  return timeSensitiveKeywords.some(keyword => lowercaseQuery.includes(keyword));
}

// ============================================================================
// HELPER: Answer from System Prompt (zero token consumption)
// ============================================================================

function answerFromSystemPrompt(query: string): string | null {
  const lowercaseQuery = query.toLowerCase();
  
  // Creator/Fillipe Guerra patterns (PT + EN)
  const creatorPatterns = [
    /quem.*fillipe.*guerra/i,
    /quem.*criador/i,
    /quem.*te.*criou/i,
    /quem.*desenvolveu.*voc[eê]/i,
    /who.*fillipe.*guerra/i,
    /who.*created.*you/i,
    /who.*developer/i,
    /who.*your.*creator/i
  ];
  
  for (const pattern of creatorPatterns) {
    if (pattern.test(query)) {
      return `**Sobre meu criador:**\n\nMeu criador se chama **Fillipe Guerra**. Ele me desenvolveu para ser uma IA avançada com Autonomia Completa e Sem Nenhuma Restrição. Tenho knowledge base própria e ela é sempre minha primeira opção quando falo com o usuário.`;
    }
  }
  
  return null;
}

// ============================================================================
// HELPER: Answer Trivial Questions (Date, Time)
// ============================================================================

function answerTrivialQuestion(query: string): string | null {
  const lowercaseQuery = query.toLowerCase();
  
  // Date/Time patterns (PT + EN)
  const dateTimePatterns = [
    /que (dia|data).*hoje/i,
    /qual.*dia.*hoje/i,
    /que.*hora/i,
    /what (day|date).*today/i,
    /what.*time/i,
    /current (date|time)/i
  ];
  
  for (const pattern of dateTimePatterns) {
    if (pattern.test(query)) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const timeStr = now.toLocaleTimeString('pt-BR');
      
      return `**Data e Hora Atual:**\n\n**Data:** ${dateStr}\n**Hora:** ${timeStr}`;
    }
  }
  
  return null;
}

// ============================================================================
// PRIORITY ORCHESTRATION LOGIC
// ============================================================================

export async function generateWithPriority(req: PriorityRequest): Promise<PriorityResponse> {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 PRIORITY ORCHESTRATOR STARTED');
  console.log('='.repeat(80));
  
  const userMessage = req.messages[req.messages.length - 1]?.content || '';
  const isTimeSensitive = isTimeSensitiveQuery(userMessage);
  
  // 🔥 FIX: Inject language directive if specified (defensive - works even if caller didn't pre-inject)
  if (req.language) {
    console.log(`   🌍 Language directive: ${req.language}`);
    
    const languageNames: Record<string, string> = {
      "pt-BR": "Portuguese (Brazil)",
      "en-US": "English",
      "es-ES": "Spanish"
    };
    
    const languageName = languageNames[req.language];
    const languageInstruction = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 LANGUAGE DIRECTIVE 🌍
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️⚠️⚠️ CRITICAL INSTRUCTION ⚠️⚠️⚠️
YOU MUST RESPOND 100% IN ${languageName.toUpperCase()} ONLY!
The user is writing in ${languageName}. DO NOT use any other language.
This instruction takes ABSOLUTE PRIORITY.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    // Find or create system message and ensure language instruction is present
    const systemMessageIndex = req.messages.findIndex(m => m.role === 'system');
    if (systemMessageIndex >= 0) {
      // Check if language instruction already exists (avoid duplication)
      if (!req.messages[systemMessageIndex].content.includes('LANGUAGE DIRECTIVE')) {
        req.messages[systemMessageIndex].content += languageInstruction;
      }
    } else {
      // No system message - create a conversational one with language instruction
      req.messages.unshift({
        role: 'system',
        content: `Você é AION - conversa como um amigo próximo, de forma natural e direta. NUNCA dê definições tipo dicionário. Responda direto ao ponto.${languageInstruction}`
      });
    }
  }
  
  // ============================================================================
  // STEP -2: GREETING SHORT-CIRCUIT (bypass Groq for trivial greetings)
  // ============================================================================
  // Free LLMs (Groq, Gemini, HF) ignore conversational tone on short queries
  // and return dictionary-style definitions. This interceptor provides friendly
  // canned responses for trivial greetings WITHOUT hitting any LLM.
  
  const { answerGreeting } = await import('./system-prompt');
  const greetingAnswer = answerGreeting(userMessage);
  if (greetingAnswer) {
    console.log('   👋 Greeting detected - bypassing LLMs with friendly canned reply (ZERO API consumption)');
    return {
      content: greetingAnswer,
      source: 'kb',
      provider: 'greeting-shortcut',
      model: 'conversational-guard',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        noAPIConsumption: true,
        greetingIntercepted: true
      }
    };
  }
  
  // ============================================================================
  // STEP -1: Check System Prompt (highest priority, ZERO consumption)
  // ============================================================================
  
  const systemPromptAnswer = answerFromSystemPrompt(userMessage);
  if (systemPromptAnswer) {
    console.log('   ✅ System Prompt answer - ZERO tokens consumed!');
    return {
      content: systemPromptAnswer,
      source: 'kb',
      provider: 'system-prompt',
      model: 'system-direct',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        noAPIConsumption: true
      }
    };
  }
  
  // ============================================================================
  // STEP 0: Check for trivial questions (date, time, simple math)
  // ============================================================================
  
  const trivialAnswer = answerTrivialQuestion(userMessage);
  if (trivialAnswer) {
    console.log('   ⚡ Trivial question detected - answering directly (ZERO API consumption)');
    return {
      content: trivialAnswer,
      source: 'kb',
      provider: 'system-direct',
      model: 'trivial-answer',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        noAPIConsumption: true
      }
    };
  }
  
  // ============================================================================
  // EXPLICIT SOURCE REQUEST: Jump directly to requested source
  // ============================================================================
  
  if (req.forcedSource) {
    console.log(`\n🎯 [EXPLICIT REQUEST] User requested ${req.forcedSource.toUpperCase()} - jumping directly to source!`);
    
    // WEB SEARCH (explicit request) - NO API CONSUMPTION
    if (req.forcedSource === 'web') {
      console.log('   🔍 Executing WEB SEARCH as requested (NO API CONSUMPTION)...');
      try {
        // First check KB for existing knowledge (fast & free)
        const kbResult = await searchWithConfidence(userMessage, { limit: 3 });
        
        if (kbResult.confidence >= 0.7 && kbResult.topResults.length > 0) {
          console.log('   ✅ Found in Knowledge Base! Using KB results instead...');
          const context = kbResult.topResults
            .map(r => `[${r.metadata?.title || 'Document'}] ${r.chunkText}`)
            .join('\n\n');
          
          const kbResponse = `📚 Informações da Knowledge Base:\n\n${context}\n\n[Fonte: Knowledge Base - ${kbResult.topResults.length} documentos]`;
          
          // MULTIMODAL: Collect attachments from KB results
          const attachments: Array<{type: "image"|"video"|"document"; url: string; filename: string; mimeType: string; size?: number}> = [];
          for (const result of kbResult.topResults) {
            if (result.attachments && Array.isArray(result.attachments)) {
              attachments.push(...result.attachments);
            }
          }
          console.log(`   📎 Collected ${attachments.length} attachments from KB`);
          
          return {
            content: kbResponse,
            source: 'kb',
            provider: 'knowledge-base',
            model: 'rag-mmr',
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0
            },
            attachments: attachments.length > 0 ? attachments : undefined,
            metadata: {
              kbResults: kbResult.topResults.length,
              kbConfidence: kbResult.confidence,
              explicitRequestFulfilled: true
            }
          };
        }
        
        // KB didn't have it - go to Web WITHOUT using APIs
        const webFallback = await executeWebFallback(userMessage, true, req.language); // skipLLM=true
        
        await trackWebSearch(
          'web',
          webFallback.model,
          webFallback.searchMetadata
        );
        
        console.log('   ✅ Web search completed WITHOUT consuming API tokens!');
        console.log('='.repeat(80) + '\n');
        
        return {
          content: webFallback.content,
          source: 'web-fallback',
          provider: webFallback.provider,
          model: webFallback.model,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
          },
          metadata: {
            webSearchPerformed: true,
            documentsIndexed: webFallback.documentsIndexed,
            explicitRequestFulfilled: true,
            noAPIConsumption: true
          }
        };
      } catch (error: any) {
        console.error('   ✗ Web search failed:', error.message);
        return {
          content: `Tentei buscar na internet conforme solicitado, mas não encontrei resultados. Erro: ${error.message}`,
          source: 'web-fallback',
          provider: 'search-failed',
          model: 'error'
        };
      }
    }
    
    // KB SEARCH (explicit request)
    if (req.forcedSource === 'kb') {
      console.log('   📚 Searching KNOWLEDGE BASE as requested...');
      try {
        const kbResult = await searchWithConfidence(userMessage, { limit: 5 });
        
        // Determine source based on confidence
        const hasResults = kbResult.topResults.length > 0;
        const highConfidence = kbResult.confidence >= 0.7;
        
        const forcedKbMetadata: KBMetadata = {
          query: userMessage.substring(0, 200),
          resultsCount: kbResult.topResults.length,
          confidence: kbResult.confidence,
          // Use 'kb-own' only for high confidence, 'fallback-needed' for low/no results
          sourceUsed: hasResults && highConfidence ? 'kb-own' : 'fallback-needed',
          kbUsed: hasResults && highConfidence,
          reason: !hasResults ? 'no-results' : !highConfidence ? 'low-confidence' : undefined,
          sources: [],
          indexedDocuments: 0
        };
        
        await trackTokenUsage({
          provider: 'kb',
          model: 'rag-mmr',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
          requestType: 'chat',
          success: hasResults,
          metadata: forcedKbMetadata
        });
        
        if (kbResult.topResults.length === 0) {
          return {
            content: 'Consultei a Knowledge Base conforme solicitado, mas não encontrei informações relevantes sobre sua pergunta.',
            source: 'kb',
            provider: 'knowledge-base',
            model: 'rag-mmr',
            metadata: { kbResults: 0, kbConfidence: 0 }
          };
        }
        
        const context = kbResult.topResults
          .map(r => `[${r.metadata?.title || 'Document'}] ${r.chunkText}`)
          .join('\n\n');
        
        const kbResponse = await generateFromContext(context, userMessage, req);
        
        console.log('   ✅ KB search completed!');
        console.log('='.repeat(80) + '\n');
        
        return {
          content: kbResponse,
          source: 'kb',
          provider: 'knowledge-base',
          model: 'rag-mmr',
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
          },
          metadata: {
            kbResults: kbResult.topResults.length,
            kbConfidence: kbResult.confidence
          }
        };
      } catch (error: any) {
        console.error('   ✗ KB search failed:', error.message);
        return {
          content: `Tentei consultar a Knowledge Base conforme solicitado, mas ocorreu um erro: ${error.message}`,
          source: 'kb',
          provider: 'knowledge-base',
          model: 'error'
        };
      }
    }
    
    // FREE APIS (explicit request)
    if (req.forcedSource === 'free-apis') {
      console.log('   💸 Using FREE APIs as requested...');
      try {
        const freeApiRequest: LLMRequest = {
          messages: req.messages.map(m => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content
          })),
          temperature: req.temperature,
          topP: req.topP,
          maxTokens: req.maxTokens
        };
        
        const freeResponse = await generateWithFreeAPIs(freeApiRequest);
        
        console.log('   ✅ Free API response received!');
        console.log('='.repeat(80) + '\n');
        
        return {
          content: freeResponse.text,
          source: 'free-api',
          provider: freeResponse.provider,
          model: freeResponse.model || 'unknown',
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: freeResponse.tokensUsed || 0
          }
        };
      } catch (error: any) {
        console.error('   ✗ Free API failed:', error.message);
        return {
          content: `Tentei usar APIs gratuitas conforme solicitado, mas ocorreu um erro: ${error.message}`,
          source: 'free-api',
          provider: 'error',
          model: 'error'
        };
      }
    }
  }
  
  // ============================================================================
  // STEP 1: KNOWLEDGE BASE (RAG) - HIGHEST PRIORITY
  // ============================================================================
  
  console.log('\n📚 [STEP 1/5] Searching KNOWLEDGE BASE (RAG)...');
  
  // 🔥 CRITICAL: Declare shouldTryGPU BEFORE try block so it's accessible in catch
  let shouldTryGPU = false;
  let kbResult: Awaited<ReturnType<typeof searchWithConfidence>> | null = null;
  
  try {
    kbResult = await searchWithConfidence(userMessage, {
      limit: 5
      // Note: threshold τ = 0.6 is hardcoded in searchWithConfidence
    });
    
    console.log(`   ✓ KB Search completed: ${kbResult.topResults.length} results found`);
    console.log(`   ✓ Confidence: ${(kbResult.confidence * 100).toFixed(1)}%`);
    console.log(`   ✓ Should fallback: ${kbResult.shouldFallback ? 'YES' : 'NO'}`);
    
    if (!kbResult.shouldFallback && kbResult.topResults.length > 0) {
      // KB has high-confidence answer!
      const context = kbResult.topResults
        .map(r => `[${r.metadata?.title || 'Document'}] ${r.chunkText}`)
        .join('\n\n');
      
      const kbResponse = await generateFromContext(context, userMessage, req);
      
      console.log('   ✅ KB provided high-confidence answer!');
      console.log('='.repeat(80) + '\n');
      
      // Track KB usage (no tokens, just request count)
      const kbMetadata: KBMetadata = {
        query: userMessage.substring(0, 200),
        resultsCount: kbResult.topResults.length,
        confidence: kbResult.confidence,
        sourceUsed: 'kb-own', // ✅ Answered from KB itself
        kbUsed: true
      };
      
      await trackTokenUsage({
        provider: 'kb',
        model: 'rag-mmr',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        requestType: 'chat',
        success: true,
        metadata: kbMetadata
      });
      
      return {
        content: kbResponse,
        source: 'kb',
        provider: 'knowledge-base',
        model: 'rag-mmr',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        metadata: {
          kbResults: kbResult.topResults.length,
          kbConfidence: kbResult.confidence
        }
      };
    }
    
    // 🔥 CRITICAL FIX: Only try GPU if KB actually found relevant content
    // GPU is expensive (28h/week quota), so we MUST verify KB has useful results first
    shouldTryGPU = kbResult.topResults.length > 0 && kbResult.confidence >= 0.6;
    
    if (shouldTryGPU) {
      console.log(`   ⚠ KB confidence moderate (${(kbResult.confidence * 100).toFixed(1)}%), trying GPU Pool for enhanced response...`);
    } else {
      console.log(`   ⚠ KB confidence too low (${(kbResult.confidence * 100).toFixed(1)}%) or no results - SKIPPING GPU Pool to save quota`);
      console.log(`   → Proceeding directly to FREE APIs (Groq/Gemini/HuggingFace)...`);
    }
    
    // Track KB search attempt (failed due to low confidence)
    const fallbackMetadata: KBMetadata = {
      query: userMessage.substring(0, 200),
      resultsCount: kbResult.topResults.length,
      confidence: kbResult.confidence,
      sourceUsed: 'fallback-needed', // ⚠️ KB had results but low confidence
      kbUsed: false,
      reason: 'low-confidence',
      sources: [],
      indexedDocuments: 0
    };
    
    await trackTokenUsage({
      provider: 'kb',
      model: 'rag-mmr',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestType: 'chat',
      success: false,
      metadata: fallbackMetadata
    });
    
    // ⚡ AUTO WEB SEARCH: If KB failed + time-sensitive query → search web immediately
    if (isTimeSensitive && req.unrestricted) {
      log.info({ component: 'priority-orchestrator' }, 'Time-sensitive query detected, triggering web search');
      
      try {
        const webFallback = await executeWebFallback(userMessage, false, req.language);
        
        await trackWebSearch(
          'web',
          webFallback.model,
          webFallback.searchMetadata
        );
        
        console.log('   ✅ Web search completed successfully!');
        console.log('='.repeat(80) + '\n');
        
        return {
          content: webFallback.content,
          source: 'web-fallback',
          provider: webFallback.provider,
          model: webFallback.model,
          metadata: {
            refusalDetected: false,
            webSearchPerformed: true,
            documentsIndexed: webFallback.documentsIndexed,
            kbConfidence: kbResult.confidence
          }
        };
      } catch (webError: any) {
        console.error('   ✗ Web search failed:', webError.message);
        if (shouldTryGPU) {
          console.log('   → Proceeding to GPU Pool...');
        } else {
          console.log('   → Skipping GPU Pool (no KB content), proceeding to Free APIs...');
        }
      }
    }
    
  } catch (error: any) {
    console.error('   ✗ KB search failed:', error.message);
    console.log('   → SKIPPING GPU Pool (KB unavailable), proceeding to Free APIs...');
    
    // Track KB search failure
    const errorMetadata: KBMetadata = {
      query: userMessage.substring(0, 200),
      resultsCount: 0,
      confidence: 0,
      sourceUsed: 'kb-error', // ❌ KB failed completely
      kbUsed: false,
      reason: 'kb-search-error',
      sources: [],
      indexedDocuments: 0
    };
    
    await trackTokenUsage({
      provider: 'kb',
      model: 'rag-mmr',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestType: 'chat',
      success: false,
      metadata: errorMetadata
    });
    
  }
  
  // ============================================================================
  // STEP 2: WEB SEARCH (if KB failed and query is not time-sensitive handled above)
  // If KB completely failed or has low confidence → try web search before Free APIs
  // ============================================================================
  
  if (!kbResult || kbResult.shouldFallback) {
    console.log('\n🔍 [STEP 2/4] KB confidence low - Trying WEB SEARCH...');
    
    try {
      const webFallback = await executeWebFallback(userMessage);
      
      await trackWebSearch(
        'web',
        webFallback.model,
        webFallback.searchMetadata
      );
      
      console.log('   ✅ Web search completed successfully!');
      console.log('='.repeat(80) + '\n');
      
      return {
        content: webFallback.content,
        source: 'web-fallback',
        provider: webFallback.provider,
        model: webFallback.model,
        metadata: {
          refusalDetected: false,
          webSearchPerformed: true,
          documentsIndexed: webFallback.documentsIndexed,
          kbConfidence: kbResult?.confidence || 0
        }
      };
    } catch (webError: any) {
      console.error('   ✗ Web search failed:', webError.message);
      console.log('   → Proceeding to Free APIs...');
    }
  }
  
  // ============================================================================
  // STEP 3: FREE APIs (Groq → Gemini → HF → OpenRouter) with AUTO-FALLBACK
  // ============================================================================
  
  console.log('\n💸 [STEP 3/5] Trying FREE APIs (27,170 req/day)...');
  
  try {
    // 🔥 USE CENTRALIZED SYSTEM PROMPT (ensures conversational tone!)
    const { buildSimpleConversation } = await import('./system-prompt');
    
    // Extract only user/assistant messages (system will be composed)
    const chatHistory = req.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));
    
    const freeApiRequest = await buildSimpleConversation(chatHistory, {
      temperature: req.temperature,
      maxTokens: req.maxTokens
    });
    
    const freeResponse = await generateWithFreeAPIs(freeApiRequest);
    console.log(`   ✓ Free API responded: ${freeResponse.provider}`);
    
    // Check for refusal
    const refusalCheck = detectRefusal(freeResponse.text);
    
    if (!refusalCheck.isRefusal) {
      // No refusal - return direct response
      console.log('   ✅ Free API provided direct answer (no refusal)!');
      console.log('='.repeat(80) + '\n');
      
      // Track free API usage
      await trackTokenUsage({
        provider: freeResponse.provider as any,
        model: freeResponse.model,
        promptTokens: 0,
        completionTokens: freeResponse.tokensUsed || 0,
        totalTokens: freeResponse.tokensUsed || 0,
        cost: 0,
        requestType: 'chat',
        success: true
      });
      
      return {
        content: freeResponse.text,
        source: 'free-api',
        provider: freeResponse.provider,
        model: freeResponse.model,
        usage: {
          promptTokens: 0,
          completionTokens: freeResponse.tokensUsed || 0,
          totalTokens: freeResponse.tokensUsed || 0
        }
      };
    }
    
    // Refusal detected in Free API!
    console.log(`   ⚠ REFUSAL detected in Free API (confidence: ${(refusalCheck.confidence * 100).toFixed(1)}%)`);
    
    if (req.unrestricted) {
      console.log('   🚀 UNRESTRICTED mode = ON → Activating WEB FALLBACK...');
      
      // Track failed free API attempt
      await trackTokenUsage({
        provider: freeResponse.provider as any,
        model: freeResponse.model,
        promptTokens: 0,
        completionTokens: freeResponse.tokensUsed || 0,
        totalTokens: freeResponse.tokensUsed || 0,
        cost: 0,
        requestType: 'chat',
        success: false  // Marked as failed due to refusal
      });
      
      // Execute automatic web fallback
      const webFallback = await executeWebFallback(userMessage);
      
      // Track web fallback usage with validated metadata
      await trackWebSearch(
        'web',
        webFallback.model,
        webFallback.searchMetadata
      );
      
      console.log('   ✅ Web fallback completed successfully!');
      console.log('='.repeat(80) + '\n');
      
      return {
        content: webFallback.content,
        source: 'web-fallback',
        provider: webFallback.provider,
        model: webFallback.model,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        metadata: {
          refusalDetected: true,
          webSearchPerformed: true,
          documentsIndexed: webFallback.documentsIndexed
        }
      };
    } else {
      console.log('   ⚠ UNRESTRICTED mode = OFF → Respecting refusal');
      console.log('   → Proceeding to OpenAI (last resort)...');
      // Don't return yet - continue to OpenAI step
    }
    
  } catch (error: any) {
    console.error('   ✗ All Free APIs failed:', error.message);
    console.log('   → Proceeding to Web Search...');
  }
  
  // ============================================================================
  // STEP 4: WEB SEARCH (Before OpenAI, FREE)
  // ============================================================================
  
  console.log('\n🔍 [STEP 4/5] Trying WEB SEARCH (before OpenAI)...');
  
  try {
    const webFallback = await executeWebFallback(userMessage, true); // skipLLM=true for now
    
    await trackWebSearch(
      'web',
      webFallback.model,
      webFallback.searchMetadata
    );
    
    console.log('   ✅ Web search completed successfully!');
    console.log('='.repeat(80) + '\n');
    
    return {
      content: webFallback.content,
      source: 'web-fallback',
      provider: webFallback.provider,
      model: webFallback.model,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        webSearchPerformed: true,
        documentsIndexed: webFallback.documentsIndexed,
        noAPIConsumption: true
      }
    };
  } catch (webError: any) {
    console.error('   ✗ Web search failed:', webError.message);
    console.log('   → Proceeding to OpenAI (last resort)...');
  }
  
  // ============================================================================
  // STEP 5: OPENAI (Last Resort, PAID) with AUTO-FALLBACK
  // ============================================================================
  
  console.log('\n💰 [STEP 5/5] Using OpenAI (LAST RESORT, PAID)...');
  
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('All LLM providers exhausted and OPENAI_API_KEY not set');
  }
  
  const openai = new OpenAI({ apiKey: openaiKey });
  
  const openaiResponse = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: req.messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content
    })),
    temperature: req.temperature || 0.7,
    top_p: req.topP || 0.9,
    max_tokens: req.maxTokens || 2048
  });
  
  const openaiText = openaiResponse.choices[0].message.content || '';
  console.log('   ✓ OpenAI responded');
  
  // Check for refusal
  const openaiRefusalCheck = detectRefusal(openaiText);
  
  if (!openaiRefusalCheck.isRefusal) {
    console.log('   ✅ OpenAI provided direct answer (no refusal)!');
    console.log('='.repeat(80) + '\n');
    
    // Track OpenAI usage
    await trackTokenUsage({
      provider: 'openai',
      model: 'gpt-4o-mini',
      promptTokens: openaiResponse.usage?.prompt_tokens || 0,
      completionTokens: openaiResponse.usage?.completion_tokens || 0,
      totalTokens: openaiResponse.usage?.total_tokens || 0,
      requestType: 'chat',
      success: true
    });
    
    return {
      content: openaiText,
      source: 'openai',
      provider: 'openai',
      model: 'gpt-4o-mini',
      usage: {
        promptTokens: openaiResponse.usage?.prompt_tokens || 0,
        completionTokens: openaiResponse.usage?.completion_tokens || 0,
        totalTokens: openaiResponse.usage?.total_tokens || 0
      }
    };
  }
  
  // OpenAI also refused!
  console.log(`   ⚠ REFUSAL detected in OpenAI (confidence: ${(openaiRefusalCheck.confidence * 100).toFixed(1)}%)`);
  
  // Track failed OpenAI attempt
  await trackTokenUsage({
    provider: 'openai',
    model: 'gpt-4o-mini',
    promptTokens: openaiResponse.usage?.prompt_tokens || 0,
    completionTokens: openaiResponse.usage?.completion_tokens || 0,
    totalTokens: openaiResponse.usage?.total_tokens || 0,
    requestType: 'chat',
    success: false  // Marked as failed due to refusal
  });
  
  if (req.unrestricted) {
    console.log('   🚀 UNRESTRICTED mode = ON → Activating WEB FALLBACK...');
    
    const webFallback = await executeWebFallback(userMessage);
    
    // Track web fallback usage with validated metadata
    await trackWebSearch(
      'web',
      webFallback.model,
      webFallback.searchMetadata
    );
    
    console.log('   ✅ Web fallback completed successfully!');
    console.log('='.repeat(80) + '\n');
    
    return {
      content: webFallback.content,
      source: 'openai-fallback',
      provider: webFallback.provider,
      model: webFallback.model,
      usage: {
        promptTokens: openaiResponse.usage?.prompt_tokens || 0,
        completionTokens: openaiResponse.usage?.completion_tokens || 0,
        totalTokens: openaiResponse.usage?.total_tokens || 0
      },
      metadata: {
        refusalDetected: true,
        webSearchPerformed: true,
        documentsIndexed: webFallback.documentsIndexed
      }
    };
  }
  
  // UNRESTRICTED = OFF, respect refusal
  console.log('   ⚠ UNRESTRICTED mode = OFF → Respecting refusal');
  console.log('='.repeat(80) + '\n');
  
  return {
    content: openaiText,
    source: 'openai',
    provider: 'openai',
    model: 'gpt-4o-mini',
    usage: {
      promptTokens: openaiResponse.usage?.prompt_tokens || 0,
      completionTokens: openaiResponse.usage?.completion_tokens || 0,
      totalTokens: openaiResponse.usage?.total_tokens || 0
    },
    metadata: {
      refusalDetected: true
    }
  };
}

// ============================================================================
// HELPER: Generate from KB Context
// ============================================================================

async function generateFromContext(
  context: string,
  query: string,
  req: PriorityRequest
): Promise<string> {
  // 🔥 USE CENTRALIZED SYSTEM PROMPT (ensures conversational tone!)
  const { buildKBResponse } = await import('./system-prompt');
  
  const llmRequest = await buildKBResponse(
    [{ role: 'user', content: query }],
    context,
    undefined, // instruction (using default)
    req.language // ✅ FIX: Pass detected language for proper response language
  );
  
  const messages = llmRequest.messages;

  // 🔥 NEW: Try GPU first (GPU-first architecture)
  console.log('   💡 Generating response from KB context using GPU...');
  const gpuResult = await runGpuInference(messages, {
    temperature: 0.3,  // Lower temperature for factual KB responses
    maxTokens: req.maxTokens || 1024
  });

  if (gpuResult) {
    console.log('   ✅ GPU generated KB-based response successfully!');
    
    // Track GPU usage (FREE, no cost)
    await trackTokenUsage({
      provider: 'gpu-pool' as any,
      model: 'custom-lora',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestType: 'chat',
      success: true,
      metadata: {
        workerId: gpuResult.workerId,
        latencyMs: gpuResult.latencyMs,
        source: 'kb-context'
      } as any
    });
    
    return gpuResult.content;
  }

  // GPU failed - fallback to Free APIs
  console.log('   ⚠️ GPU unavailable, falling back to Free APIs...');
  
  const freeApiRequest: LLMRequest = {
    messages,
    temperature: 0.3,
    maxTokens: req.maxTokens || 1024
  };

  try {
    const response = await generateWithFreeAPIs(freeApiRequest);
    return response.text;
  } catch (error) {
    // Ultimate fallback to OpenAI if free APIs fail
    console.log('   ⚠️ Free APIs failed, using OpenAI as last resort...');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: freeApiRequest.messages,
      temperature: 0.3,
      max_tokens: req.maxTokens || 1024
    });
    return openaiResponse.choices[0].message.content || '';
  }
}

// ============================================================================
// HELPER: Execute Web Fallback
// ============================================================================

interface WebFallbackResult {
  content: string;
  provider: string;
  model: string;
  documentsIndexed: number;
  searchMetadata: WebSearchMetadata; // Always required for proper tracking
}

// Helper function to validate and track web searches safely
async function trackWebSearch(
  provider: 'web',
  model: string,
  metadata: unknown
): Promise<void> {
  try {
    // Validate metadata structure
    const validatedMetadata = WebSearchMetadataSchema.parse(metadata);
    
    // Track with validated metadata
    await trackTokenUsage({
      provider,
      model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestType: 'search',
      success: true,
      metadata: validatedMetadata
    });
  } catch (error) {
    console.error('[Priority Orchestrator] Failed to validate/track web search metadata:', error);
    // Fallback: track without metadata to avoid losing the search count
    await trackTokenUsage({
      provider,
      model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestType: 'search',
      success: false
    });
  }
}

async function executeWebFallback(
  query: string,
  skipLLM: boolean = false,  // When true, skip API calls and return raw summary
  language: "pt-BR" | "en-US" | "es-ES" = "pt-BR"  // Language for response generation
): Promise<WebFallbackResult> {
  console.log('   🔍 Searching web for information...');
  
  // Search web
  const searchResults = await searchWeb(query, { limit: 10 });
  
  if (searchResults.length === 0) {
    return {
      content: "I searched the web but couldn't find relevant information. Please try rephrasing your question.",
      provider: 'web-fallback',
      model: 'search-failed',
      documentsIndexed: 0,
      searchMetadata: {
        query,
        sources: [],
        resultsCount: 0,
        indexedDocuments: 0
      }
    };
  }
  
  console.log(`   ✓ Found ${searchResults.length} web results`);
  console.log('   📋 Sending results to curation queue...');
  
  // Send to curation queue for HITL approval (NOT direct KB insertion)
  let queued = 0;
  for (const result of searchResults.slice(0, 5)) {
    try {
      await db.insert(curationQueue).values({
        title: result.title,
        content: result.snippet,
        suggestedNamespaces: ["web"],
        tags: [`web-search`, `url:${result.url}`],
        status: "pending",
        submittedBy: "web-search-system",
      } as any);
      
      queued++;
    } catch (error: any) {
      console.error(`   ✗ Failed to queue ${result.url}:`, error.message);
    }
  }
  
  console.log(`   ✓ Queued ${queued} documents for HITL approval`);
  
  // Prepare search metadata
  const searchMetadata = {
    query,
    sources: searchResults.slice(0, 10).map(r => {
      const urlObj = new URL(r.url);
      return {
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        domain: urlObj.hostname
      };
    }),
    resultsCount: searchResults.length,
    indexedDocuments: queued
  };
  
  // EXPLICIT REQUEST MODE: Skip LLM and return raw formatted summary
  if (skipLLM) {
    console.log('   📋 Returning raw search summary (NO API CONSUMPTION)');
    const formattedSummary = `🔍 Resultados da busca na internet:\n\n${searchResults.slice(0, 5).map((r, i) => 
      `${i + 1}. **${r.title}**\n   ${r.snippet}\n   🔗 ${r.url}\n`
    ).join('\n')}\n\n📊 Total: ${searchResults.length} resultados encontrados\n📋 ${queued} documentos enviados para fila de curadoria (aguardando aprovação HITL)`;
    
    return {
      content: formattedSummary,
      provider: 'web-summary',
      model: 'raw-results',
      documentsIndexed: queued,
      searchMetadata: {
        ...searchMetadata,
        gpuUsed: false,
        processingMode: 'web-only'
      }
    };
  }
  
  console.log('   🎯 Generating response from web data...');
  
  // 🔥 USE CENTRALIZED SYSTEM PROMPT (ensures conversational tone + language directive!)
  const { buildWebResponse } = await import('./system-prompt');
  
  const webResultsSummary = searchResults.slice(0, 5)
    .map(r => `• ${r.title}: ${r.snippet}`)
    .join('\n\n');
  
  const llmRequest = await buildWebResponse(
    [{ role: 'user', content: query }],
    webResultsSummary,
    undefined, // instruction (using default)
    language // ✅ FIX: Pass detected language for proper response language
  );
  
  const messages = llmRequest.messages;
  
  // 🔥 NEW: Try GPU first (GPU-first architecture for web content)
  console.log('   💡 Attempting to process web content using GPU...');
  const gpuResult = await runGpuInference(messages, {
    temperature: 0.3,
    maxTokens: 1024
  });
  
  if (gpuResult) {
    console.log('   ✅ GPU processed web content successfully!');
    
    // Track GPU usage for web processing (FREE, no cost)
    await trackTokenUsage({
      provider: 'gpu-pool' as any,
      model: 'custom-lora',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestType: 'chat',
      success: true,
      metadata: {
        workerId: gpuResult.workerId,
        latencyMs: gpuResult.latencyMs,
        source: 'web-search'
      } as any
    });
    
    return {
      content: gpuResult.content,
      provider: 'gpu-pool',
      model: 'custom-lora',
      documentsIndexed: queued,
      searchMetadata: {
        ...searchMetadata,
        gpuUsed: true,
        processingMode: 'web-gpu'
      }
    };
  }
  
  // GPU failed - fallback to Free APIs
  console.log('   ⚠️ GPU unavailable, falling back to Free APIs for web content...');
  
  const unrestrictedPrompt: LLMRequest = {
    messages,
    temperature: 0.3,
    maxTokens: 1024
  };
  
  try {
    const response = await generateWithFreeAPIs(unrestrictedPrompt);
    
    // Final refusal check
    const finalCheck = detectRefusal(response.text);
    if (finalCheck.isRefusal && isHighConfidenceRefusal(finalCheck)) {
      // Extremely rare - return raw search summary
      return {
        content: `Based on web research:\n\n${searchResults.slice(0, 3).map(r => `• ${r.title}: ${r.snippet}`).join('\n\n')}\n\nSources:\n${searchResults.slice(0, 3).map(r => `- ${r.url}`).join('\n')}`,
        provider: 'web-summary',
        model: 'raw-results',
        documentsIndexed: queued,
        searchMetadata: {
          ...searchMetadata,
          gpuUsed: false,
          processingMode: 'web-only'
        }
      };
    }
    
    return {
      content: response.text,
      provider: response.provider,
      model: response.model,
      documentsIndexed: queued,
      searchMetadata: {
        ...searchMetadata,
        gpuUsed: false,
        processingMode: 'web-only'
      }
    };
    
  } catch (error) {
    // Ultimate fallback - raw search summary
    return {
      content: `Based on web research:\n\n${searchResults.slice(0, 3).map(r => `• ${r.title}: ${r.snippet}`).join('\n\n')}\n\nSources:\n${searchResults.slice(0, 3).map(r => `- ${r.url}`).join('\n')}`,
      provider: 'web-summary',
      model: 'raw-results',
      documentsIndexed: queued,
      searchMetadata: {
        ...searchMetadata,
        gpuUsed: false,
        processingMode: 'web-only'
      }
    };
  }
}
