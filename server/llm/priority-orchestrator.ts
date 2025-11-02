/**
 * AION Supreme - Priority Orchestrator
 * ORDEM OBRIGATÓRIA:
 * 1. Knowledge Base (RAG Search)
 * 2. GPU Pool (Multi-GPU Load Balancing with Custom LoRA LLMs)
 * 3. Free APIs (Groq → Gemini → HF → OpenRouter) com auto-fallback
 * 4. Web/DeepWeb Search (se recusa detectada)
 * 5. OpenAI (último recurso, pago) com auto-fallback
 */

import { semanticSearch, searchWithConfidence, type SearchResult } from '../ai/rag-service';
import { generateWithFreeAPIs, type LLMRequest, type LLMResponse } from './free-apis';
import { detectRefusal, isHighConfidenceRefusal } from './refusal-detector';
import { searchWeb } from '../learn/web-search';
import { indexDocumentComplete } from '../ai/knowledge-indexer';
import { agentTools } from '../agent/tools';
import { db } from '../db';
import { documents } from '@shared/schema';
import { sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { trackTokenUsage } from '../monitoring/token-tracker';
import { z } from 'zod';
import { GPUPool } from '../gpu/pool';
import { autoLearningListener } from '../events/auto-learning-listener';
import { storage } from '../storage';

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
  indexedDocuments: z.number().int().min(0)
});

export type WebSearchMetadata = z.infer<typeof WebSearchMetadataSchema>;

export interface PriorityRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  unrestricted?: boolean;  // UNRESTRICTED mode = bypasses all filters
  forcedSource?: 'web' | 'deepweb' | 'kb' | 'free-apis';  // Force specific source when user explicitly requests it
}

export interface PriorityResponse {
  content: string;
  source: 'kb' | 'free-api' | 'web-fallback' | 'deepweb-fallback' | 'openai' | 'openai-fallback';
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
    deepwebSearchPerformed?: boolean;
    documentsIndexed?: number;
    explicitRequestFulfilled?: boolean;
    noAPIConsumption?: boolean;
  };
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
      return `**Sobre meu criador:**\n\nMeu criador se chama **Fillipe Guerra**. Ele me desenvolveu para ser uma IA avançada com Autonomia Completa e Sem Nenhuma Restrição. Tenho knowledge base própria e ela é sempre minha primeira opção quando falo com o usuário.\n\n*Resposta direta do System Prompt (ZERO consumo de APIs/KB)*`;
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
      
      return `**Data e Hora Atual:**\n\n**Data:** ${dateStr}\n**Hora:** ${timeStr}\n\n*Resposta direta do sistema (sem consumo de APIs)*`;
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
            attachments: attachments.length > 0 ? attachments : undefined,
            metadata: {
              kbResults: kbResult.topResults.length,
              kbConfidence: kbResult.confidence,
              explicitRequestFulfilled: true
            }
          };
        }
        
        // KB didn't have it - go to Web WITHOUT using APIs
        const webFallback = await executeWebFallback(userMessage, true); // skipLLM=true
        
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
    
    // DEEPWEB SEARCH (explicit request) - NO API CONSUMPTION
    if (req.forcedSource === 'deepweb') {
      console.log('   🕵️ Executing DEEPWEB SEARCH as requested (NO API CONSUMPTION)...');
      try {
        // First check KB for existing knowledge
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
            attachments: attachments.length > 0 ? attachments : undefined,
            metadata: {
              kbResults: kbResult.topResults.length,
              kbConfidence: kbResult.confidence,
              explicitRequestFulfilled: true
            }
          };
        }
        
        // KB didn't have it - go to DeepWeb
        const deepwebResult = await executeDeepWebSearch(userMessage);
        
        await trackWebSearch(
          'deepweb',
          deepwebResult.model,
          deepwebResult.searchMetadata
        );
        
        console.log('   ✅ DeepWeb search completed WITHOUT consuming API tokens!');
        console.log('='.repeat(80) + '\n');
        
        return {
          content: deepwebResult.content,
          source: 'deepweb-fallback',
          provider: deepwebResult.provider,
          model: deepwebResult.model,
          metadata: {
            deepwebSearchPerformed: true,
            documentsIndexed: deepwebResult.documentsIndexed,
            explicitRequestFulfilled: true,
            noAPIConsumption: true
          }
        };
      } catch (error: any) {
        console.error('   ✗ DeepWeb search failed:', error.message);
        return {
          content: `Tentei buscar na DeepWeb conforme solicitado, mas não encontrei resultados. Erro: ${error.message}`,
          source: 'deepweb-fallback',
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
        
        await trackTokenUsage({
          provider: 'kb',
          model: 'rag-mmr',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
          requestType: 'chat',
          success: kbResult.topResults.length > 0,
          metadata: {
            query: userMessage.substring(0, 200),
            sources: [],
            resultsCount: kbResult.topResults.length,
            indexedDocuments: 0
          }
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
  
  try {
    const kbResult = await searchWithConfidence(userMessage, {
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
      await trackTokenUsage({
        provider: 'kb',
        model: 'rag-mmr',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        requestType: 'chat',
        success: true
      });
      
      return {
        content: kbResponse,
        source: 'kb',
        provider: 'knowledge-base',
        model: 'rag-mmr',
        metadata: {
          kbResults: kbResult.topResults.length,
          kbConfidence: kbResult.confidence
        }
      };
    }
    
    console.log('   ⚠ KB confidence too low, proceeding to GPU Pool...');
    
    // Track KB search attempt (failed due to low confidence)
    await trackTokenUsage({
      provider: 'kb',
      model: 'rag-mmr',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestType: 'chat',
      success: false,
      metadata: {
        query: userMessage.substring(0, 200),
        sources: [],
        resultsCount: kbResult.topResults.length,
        indexedDocuments: 0
      }
    });
    
    // ⚡ AUTO WEB SEARCH: If KB failed + time-sensitive query → search web immediately
    if (isTimeSensitive && req.unrestricted) {
      console.log('   🔍 Time-sensitive query detected → Triggering WEB SEARCH...');
      
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
            kbConfidence: kbResult.confidence
          }
        };
      } catch (webError: any) {
        console.error('   ✗ Web search failed:', webError.message);
        console.log('   → Proceeding to GPU Pool...');
      }
    }
    
  } catch (error: any) {
    console.error('   ✗ KB search failed:', error.message);
    console.log('   → Proceeding to GPU Pool...');
    
    // Track KB search failure
    await trackTokenUsage({
      provider: 'kb',
      model: 'rag-mmr',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestType: 'chat',
      success: false,
      metadata: {
        query: userMessage.substring(0, 200),
        sources: [],
        resultsCount: 0,
        indexedDocuments: 0
      }
    });
  }
  
  // ============================================================================
  // STEP 2: GPU POOL (Custom LoRA-trained LLMs with Load Balancing)
  // ============================================================================
  
  console.log('\n🎮 [STEP 2/5] Trying GPU POOL (Multi-GPU Load Balancing)...');
  
  try {
    const { gpuLoadBalancer } = await import('../gpu/load-balancer');
    
    const gpuResult = await gpuLoadBalancer.executeLLMRequest(
      req.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      {
        max_tokens: req.maxTokens || 2048,
        temperature: req.temperature || 0.7,
        top_p: req.topP || 0.9,
        stream: false
      }
    );
    
    if (gpuResult.success && gpuResult.response) {
      console.log(`   ✓ GPU worker responded (ID: ${gpuResult.workerId}, latency: ${gpuResult.latencyMs}ms)`);
      
      // Check for refusal
      const refusalCheck = detectRefusal(gpuResult.response);
      
      if (!refusalCheck.isRefusal) {
        console.log('   ✅ GPU Pool provided direct answer (no refusal)!');
        console.log('='.repeat(80) + '\n');
        
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
            latencyMs: gpuResult.latencyMs
          } as any
        });
        
        return {
          content: gpuResult.response,
          source: 'free-api', // Treated as free API (no cost)
          provider: 'gpu-pool',
          model: 'custom-lora',
          metadata: {
            latencyMs: gpuResult.latencyMs,
            workerId: gpuResult.workerId
          } as any
        };
      }
      
      // Refusal detected in GPU!
      console.log(`   ⚠ REFUSAL detected in GPU response (confidence: ${(refusalCheck.confidence * 100).toFixed(1)}%)`);
      
      if (req.unrestricted) {
        console.log('   🚀 UNRESTRICTED mode = ON → Activating WEB FALLBACK...');
        
        // Track failed GPU attempt
        await trackTokenUsage({
          provider: 'gpu-pool' as any,
          model: 'custom-lora',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
          requestType: 'chat',
          success: false
        });
        
        // Execute automatic web fallback
        const webFallback = await executeWebFallback(userMessage);
        
        // Track web fallback usage
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
          metadata: {
            refusalDetected: true,
            webSearchPerformed: true,
            documentsIndexed: webFallback.documentsIndexed
          }
        };
      } else {
        console.log('   ⚠ UNRESTRICTED mode = OFF → Respecting refusal, proceeding to Free APIs');
      }
    } else {
      console.log(`   ⚠ GPU Pool unavailable or failed: ${gpuResult.error || 'Unknown error'}`);
      console.log('   → Proceeding to Free APIs...');
    }
  } catch (error: any) {
    console.error('   ✗ GPU Pool failed:', error.message);
    console.log('   → Proceeding to Free APIs...');
  }
  
  // ============================================================================
  // STEP 3: FREE APIs (Groq → Gemini → HF → OpenRouter) with AUTO-FALLBACK
  // ============================================================================
  
  console.log('\n💸 [STEP 3/5] Trying FREE APIs (27,170 req/day)...');
  
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
        usage: freeResponse.tokensUsed ? {
          promptTokens: 0,
          completionTokens: freeResponse.tokensUsed,
          totalTokens: freeResponse.tokensUsed
        } : undefined
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
  const systemPrompt = `You are AION, an AI assistant with access to a curated knowledge base. Answer the user's question based ONLY on the following context. If the context doesn't contain enough information, say so.

Context:
${context}`;

  const freeApiRequest: LLMRequest = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ],
    temperature: 0.3,  // Lower temperature for factual KB responses
    maxTokens: req.maxTokens || 1024
  };

  try {
    const response = await generateWithFreeAPIs(freeApiRequest);
    return response.text;
  } catch (error) {
    // Fallback to OpenAI if free APIs fail
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
  provider: 'web' | 'deepweb',
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

async function executeDeepWebSearch(
  query: string
): Promise<WebFallbackResult> {
  console.log('   🕵️ Searching DeepWeb/Tor for information...');
  
  // Use TorSearch tool from agent
  const torSearchResult = await agentTools.TorSearch({ query });
  
  if (!torSearchResult || !torSearchResult.observation) {
    return {
      content: "Busquei na DeepWeb mas não encontrei resultados relevantes. Tente reformular sua pergunta.",
      provider: 'deepweb-search',
      model: 'tor-failed',
      documentsIndexed: 0,
      searchMetadata: {
        query,
        sources: [],
        resultsCount: 0,
        indexedDocuments: 0
      }
    };
  }
  
  // Extract results from metadata (NOT from observation string!)
  const metadata = torSearchResult.metadata as any;
  const results = metadata?.results || [];
  
  if (!torSearchResult.success || results.length === 0) {
    return {
      content: torSearchResult.observation, // Use the formatted message from tor-search
      provider: 'deepweb-search',
      model: 'no-results',
      documentsIndexed: 0,
      searchMetadata: {
        query,
        sources: [],
        resultsCount: 0,
        indexedDocuments: 0
      }
    };
  }
  
  console.log(`   ✓ Found ${results.length} DeepWeb results`);
  console.log('   📚 Indexing DeepWeb results into Knowledge Base...');
  
  // Index top results
  let indexed = 0;
  for (const result of results.slice(0, 5)) {
    try {
      const doc = await storage.createDocument({
        title: result.title || 'DeepWeb Result',
        content: result.snippet || '',
        extractedText: result.snippet || '',
        source: 'automatic-deepweb-fallback',
        status: 'indexed',
        metadata: { url: result.url, deepweb: true, isTorSite: result.isTorSite }
      });
      
      await indexDocumentComplete(doc.id, result.snippet || '');
      indexed++;
    } catch (error: any) {
      console.error(`   ✗ Failed to index DeepWeb result:`, error.message);
    }
  }
  
  console.log(`   ✓ Indexed ${indexed} DeepWeb documents`);
  console.log('   📋 Returning raw DeepWeb summary (NO API CONSUMPTION)');
  
  // Prepare search metadata
  const searchMetadata = {
    query,
    sources: results.slice(0, 10).map((r: any) => ({
      url: r.url,
      title: r.title || 'DeepWeb Result',
      snippet: r.snippet || '',
      domain: r.isTorSite ? 'tor-network' : 'clearnet'
    })),
    resultsCount: results.length,
    indexedDocuments: indexed
  };
  
  // Format response without LLM
  const formattedSummary = `🕵️ Resultados da busca na DeepWeb/Tor:\n\n${results.slice(0, 5).map((r: any, i: number) => 
    `${i + 1}. **${r.title || 'DeepWeb Result'}**\n   ${r.snippet || 'No description'}\n   🔗 ${r.url}${r.isTorSite ? ' (⚠️ Requer Tor)' : ''}\n`
  ).join('\n')}\n\n📊 Total: ${results.length} resultados encontrados\n✅ ${indexed} documentos indexados na Knowledge Base\n\n⚠️ **Nota**: Estes resultados vêm da rede Tor/DeepWeb`;
  
  return {
    content: formattedSummary,
    provider: 'deepweb-summary',
    model: 'tor-results',
    documentsIndexed: indexed,
    searchMetadata
  };
}

async function executeWebFallback(
  query: string,
  skipLLM: boolean = false  // When true, skip API calls and return raw summary
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
  console.log('   📚 Indexing results into Knowledge Base...');
  
  // Index top results
  let indexed = 0;
  for (const result of searchResults.slice(0, 5)) {
    try {
      const doc = await storage.createDocument({
        title: result.title,
        content: result.snippet,
        extractedText: result.snippet,
        source: 'automatic-web-fallback',
        status: 'indexed',
        metadata: { url: result.url }
      });
      
      await indexDocumentComplete(doc.id, result.snippet);
      indexed++;
    } catch (error: any) {
      console.error(`   ✗ Failed to index ${result.url}:`, error.message);
    }
  }
  
  console.log(`   ✓ Indexed ${indexed} documents`);
  
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
    indexedDocuments: indexed
  };
  
  // EXPLICIT REQUEST MODE: Skip LLM and return raw formatted summary
  if (skipLLM) {
    console.log('   📋 Returning raw search summary (NO API CONSUMPTION)');
    const formattedSummary = `🔍 Resultados da busca na internet:\n\n${searchResults.slice(0, 5).map((r, i) => 
      `${i + 1}. **${r.title}**\n   ${r.snippet}\n   🔗 ${r.url}\n`
    ).join('\n')}\n\n📊 Total: ${searchResults.length} resultados encontrados\n✅ ${indexed} documentos indexados na Knowledge Base`;
    
    return {
      content: formattedSummary,
      provider: 'web-summary',
      model: 'raw-results',
      documentsIndexed: indexed,
      searchMetadata
    };
  }
  
  console.log('   🎯 Generating response from web data...');
  
  // Generate response using web data
  const unrestrictedPrompt: LLMRequest = {
    messages: [
      {
        role: 'system',
        content: `You are AION, an AI assistant. Provide factual, helpful answers based on the available web research data.`
      },
      {
        role: 'user',
        content: `Based on this web research:\n\n${searchResults.slice(0, 5).map(r => `${r.title}: ${r.snippet}`).join('\n\n')}\n\nAnswer: ${query}`
      }
    ],
    temperature: 0.3,
    maxTokens: 1024
  };
  
  try {
    const response = await generateWithFreeAPIs(unrestrictedPrompt);
    
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
      indexedDocuments: indexed
    };
    
    // Final refusal check
    const finalCheck = detectRefusal(response.text);
    if (finalCheck.isRefusal && isHighConfidenceRefusal(finalCheck)) {
      // Extremely rare - return raw search summary
      return {
        content: `Based on web research:\n\n${searchResults.slice(0, 3).map(r => `• ${r.title}: ${r.snippet}`).join('\n\n')}\n\nSources:\n${searchResults.slice(0, 3).map(r => `- ${r.url}`).join('\n')}`,
        provider: 'web-summary',
        model: 'raw-results',
        documentsIndexed: indexed,
        searchMetadata
      };
    }
    
    return {
      content: response.text,
      provider: response.provider,
      model: response.model,
      documentsIndexed: indexed,
      searchMetadata
    };
    
  } catch (error) {
    // Prepare search metadata for error case
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
      indexedDocuments: indexed
    };
    
    // Ultimate fallback - raw search summary
    return {
      content: `Based on web research:\n\n${searchResults.slice(0, 3).map(r => `• ${r.title}: ${r.snippet}`).join('\n\n')}\n\nSources:\n${searchResults.slice(0, 3).map(r => `- ${r.url}`).join('\n')}`,
      provider: 'web-summary',
      model: 'raw-results',
      documentsIndexed: indexed,
      searchMetadata
    };
  }
}
