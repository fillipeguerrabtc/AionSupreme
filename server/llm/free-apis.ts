/**
 * AION Supreme - Free LLM APIs Rotation System
 * Total Capacity: 27,170 requests/day GRATIS
 * Priority: Groq → Gemini → HuggingFace → OpenRouter → OpenAI (last resort)
 */

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getProviderQuotas, trackTokenUsage } from '../monitoring/token-tracker';
import { apiQuotaRepository } from '../repositories/api-quota-repository';
import { log } from '../utils/logger';
import { withTimeout, TimeoutError } from '../utils/timeout';
import { llmCircuitBreakerManager } from './llm-circuit-breaker';

// ============================================================================
// TYPES
// ============================================================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;  // Top-K sampling (supported by Gemini, HuggingFace)
}

export interface LLMResponse {
  text: string;
  provider: string;
  model: string;
  tokensUsed?: number;
  cached?: boolean;
  
  // NEW: Telemetry fields for LLM Gateway alignment
  latencyMs?: number;
  costUsd?: number;
  finishReason?: string;
  
  // Tool calls (function calling) - only supported by OpenAI currently
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
}

interface APIProvider {
  name: string;
  // ❌ REMOVED: dailyLimit (now fetched dynamically from provider_limits table)
  priority: number;
  models: string[];
  enabled: boolean;
}

// ============================================================================
// API CONFIGURATIONS
// ============================================================================

const FREE_APIS: APIProvider[] = [
  {
    name: 'groq',
    // ✅ dailyLimit now fetched dynamically from provider_limits table
    priority: 1,        // HIGHEST priority (ultra-fast, no censorship)
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],  // Updated Oct 2025
    enabled: !!process.env.GROQ_API_KEY
  },
  {
    name: 'gemini',
    // ✅ dailyLimit now fetched dynamically from provider_limits table
    priority: 2,
    models: ['gemini-2.0-flash-exp', 'gemini-1.5-flash'],
    enabled: !!process.env.GEMINI_API_KEY
  },
  {
    name: 'hf',
    // ✅ dailyLimit now fetched dynamically from provider_limits table
    priority: 3,
    models: ['mistralai/Mistral-7B-Instruct-v0.2'],  // ✅ FIX: v0.2 is public (v0.3 returns 404)
    enabled: !!process.env.HUGGINGFACE_API_KEY
  },
  {
    name: 'openrouter',
    // ✅ dailyLimit now fetched dynamically from provider_limits table
    priority: 4,
    models: ['meta-llama/llama-3.1-8b-instruct:free', 'mistralai/mistral-7b-instruct:free'],
    enabled: !!process.env.OPEN_ROUTER_API_KEY
  }
];

// ============================================================================
// GROQ CLIENT
// ============================================================================
/**
 * ✅ P2.3: Groq Free Tier (2025)
 * - Rate Limits: ~6,000 TPM (tokens per minute), varies by model
 * - Returns 429 when exceeding rate limits
 * - OpenAI-compatible API
 * - Models: llama-3.3-70b-versatile, llama-3.1-8b-instant, DeepSeek R1
 * - Retry logic: 1s/2s/4s exponential backoff for 429/503/504
 */

async function callGroq(req: LLMRequest, orchestrationRemainingMs?: number): Promise<LLMResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  // ✅ CRITICAL: Use fetch to capture response headers (OpenAI SDK doesn't expose them)
  const maxRetries = 3;
  const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 🔥 P0.1 FIX: Cap timeout to orchestration remaining time (30s hard deadline)
      const effectiveTimeout = orchestrationRemainingMs 
        ? Math.max(0, Math.min(orchestrationRemainingMs, 15000))
        : 15000;
      
      // Bail out immediately if no time left
      if (effectiveTimeout <= 0) {
        throw new TimeoutError(
          'No time remaining for Groq request (orchestration deadline exceeded)',
          orchestrationRemainingMs || 0,
          'groq-llm'
        );
      }
      
      const controller = new AbortController();
      
      const response = await withTimeout(
        fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: req.messages,
            max_tokens: req.maxTokens || 1024,
            temperature: req.temperature ?? 0.7,
            top_p: req.topP ?? 0.9
          }),
          signal: controller.signal
        }),
        {
          timeoutMs: effectiveTimeout,
          operation: `groq-llm-attempt-${attempt + 1}`,
          abortController: controller,
          debug: true
        }
      );

      // ✅ CRITICAL: Extract REAL rate limit headers from Groq
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (key.startsWith('x-ratelimit-')) {
          headers[key] = value;
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.error?.message || `Groq API error: ${response.status}`);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();

      // ✅ PRODUCTION: Track real usage from Groq API
      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;
      const totalTokens = data.usage?.total_tokens || 0;
      
      // ✅ CRITICAL: Update REAL quota from Groq headers (existing service)
      try {
        const { providerLimitsTracker } = await import('../services/provider-limits-tracker');
        await providerLimitsTracker.updateGroqLimits(headers);
      } catch (trackerError: any) {
        log.warn({ component: 'groq', error: trackerError.message }, 'Failed to update real quota (non-critical)');
      }
      
      // ✅ PRODUCTION: Track quota in PostgreSQL
      await apiQuotaRepository.incrementUsage('groq', 1, totalTokens);
      
      // ✅ P2.2: Groq is FREE tier → cost calculated as $0.00
      await trackTokenUsage({
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        promptTokens,
        completionTokens,
        totalTokens,
        requestType: 'chat',
        success: true
      });

      return {
        text: data.choices[0].message.content || '',
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        tokensUsed: totalTokens
      };
    } catch (error: any) {
      lastError = error;
      
      // 🔥 P0.1 FIX: Treat TimeoutError as retryable (same as 429/503/504)
      const isTimeout = error instanceof TimeoutError;
      const isRetryable = isTimeout || error.status === 429 || error.status === 503 || error.status === 504;
      
      if (!isRetryable || attempt === maxRetries) {
        // Log timeout specifically for observability
        if (isTimeout) {
          log.error({ component: 'groq', attempt: attempt + 1, timeoutMs: error.timeoutMs }, 'Groq request timed out');
        }
        throw error;
      }
      
      // Wait before retry
      const delay = retryDelays[attempt];
      const reason = isTimeout ? 'timeout' : `rate limit (${error.status})`;
      log.warn({ component: 'groq', attempt: attempt + 1, maxRetries, delay, reason }, 'Groq call failed, retrying');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Groq API request failed after retries');
}


// ============================================================================
// GEMINI CLIENT
// ============================================================================

async function callGemini(req: LLMRequest, orchestrationRemainingMs?: number): Promise<LLMResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  // 🔥 P0.1 FIX: Switch to REST API for timeout/retry support (architect approved)
  const maxRetries = 3;
  const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 🔥 P0.1 FIX: Cap timeout to orchestration remaining time
      const effectiveTimeout = orchestrationRemainingMs 
        ? Math.max(0, Math.min(orchestrationRemainingMs, 15000))
        : 15000;
      
      if (effectiveTimeout <= 0) {
        throw new TimeoutError(
          'No time remaining for Gemini request (orchestration deadline exceeded)',
          orchestrationRemainingMs || 0,
          'gemini-llm'
        );
      }
      
      const controller = new AbortController();
      
      // 🔥 FIX: Convert messages to Gemini REST format (proper multi-turn serialization)
      const systemPrompt = req.messages.find(m => m.role === 'system')?.content || '';
      
      // Filter out system message and convert roles
      const nonSystemMessages = req.messages.filter(m => m.role !== 'system');
      
      // Guard against empty messages
      if (nonSystemMessages.length === 0) {
        throw new Error('No messages to send to Gemini (only system prompt?)');
      }
      
      // Find index of FIRST user message (not index 0, but first user turn)
      let firstUserIndex = nonSystemMessages.findIndex(m => m.role === 'user');
      let systemPrefixAdded = false;
      
      // Build contents array with proper role alternation
      const contents = nonSystemMessages.map((m, index) => {
        // Prepend system prompt to FIRST USER message (regardless of position)
        const shouldPrependSystem = (index === firstUserIndex && systemPrompt && !systemPrefixAdded);
        if (shouldPrependSystem) {
          systemPrefixAdded = true;
        }
        
        const text = shouldPrependSystem
          ? `SYSTEM INSTRUCTIONS:\n${systemPrompt}\n\n---\n\nUSER MESSAGE:\n${m.content}`
          : m.content;
        
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text }]
        };
      });
      
      // 🔥 FIX: Gemini REST expects last message to be "user" role
      // Strip trailing assistant/model messages (common in multi-turn chats)
      while (contents.length > 0 && contents[contents.length - 1].role === 'model') {
        log.warn({ component: 'gemini' }, 'Stripping trailing assistant message (Gemini REST requires last message to be user)');
        contents.pop();
      }
      
      // After stripping, if no user messages remain, error
      if (contents.length === 0) {
        throw new Error('Gemini REST API requires at least one user message (all messages were assistant turns)');
      }
      
      const response = await withTimeout(
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: req.temperature ?? 0.7,
              topP: req.topP ?? 0.9,
              maxOutputTokens: req.maxTokens || 1024
            }
          }),
          signal: controller.signal
        }),
        {
          timeoutMs: effectiveTimeout,
          operation: `gemini-llm-attempt-${attempt + 1}`,
          abortController: controller,
          debug: true
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        const error: any = new Error(`Gemini API error (${response.status}): ${errorText}`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();

      // 🔥 FIX: Guard against safety-blocked responses (no content.parts)
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('Gemini returned no candidates (possibly safety-blocked or empty response)');
      }
      
      const candidate = data.candidates[0];
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        const reason = candidate.finishReason || 'UNKNOWN';
        const safetyRatings = candidate.safetyRatings ? JSON.stringify(candidate.safetyRatings) : 'none';
        throw new Error(`Gemini blocked response: finishReason=${reason}, safetyRatings=${safetyRatings}`);
      }

      // ✅ PRODUCTION: Track real usage from Gemini API
      const promptTokens = data.usageMetadata?.promptTokenCount || 0;
      const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = data.usageMetadata?.totalTokenCount || 0;
      
      // ✅ CRITICAL: Update Gemini limits
      try {
        const { providerLimitsTracker } = await import('../services/provider-limits-tracker');
        await providerLimitsTracker.updateGeminiLimits();
      } catch (trackerError: any) {
        log.warn({ component: 'gemini', error: trackerError.message }, 'Failed to update Gemini limits (non-critical)');
      }
      
      // ✅ PRODUCTION: Track quota in PostgreSQL
      await apiQuotaRepository.incrementUsage('gemini', 1, totalTokens);
      
      // ✅ P2.2: Cost calculated automatically via token-tracker
      await trackTokenUsage({
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp',
        promptTokens,
        completionTokens,
        totalTokens,
        requestType: 'chat',
        success: true
      });

      return {
        text: candidate.content.parts[0].text,
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp',
        tokensUsed: totalTokens
      };
    } catch (error: any) {
      lastError = error;
      
      // 🔥 P0.1 FIX: Treat TimeoutError as retryable
      const isTimeout = error instanceof TimeoutError;
      const isRetryable = isTimeout || error.status === 429 || error.status === 503 || error.status === 504;
      
      if (!isRetryable || attempt === maxRetries) {
        if (isTimeout) {
          log.error({ component: 'gemini', attempt: attempt + 1, timeoutMs: error.timeoutMs }, 'Gemini request timed out');
        }
        throw error;
      }
      
      const delay = retryDelays[attempt];
      const reason = isTimeout ? 'timeout' : `rate limit (${error.status})`;
      log.warn({ component: 'gemini', attempt: attempt + 1, maxRetries, delay, reason }, 'Gemini call failed, retrying');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Gemini API request failed after retries');
}

// ============================================================================
// HUGGINGFACE CLIENT
// ============================================================================
/**
 * ✅ P2.4: HuggingFace Inference API (2025)
 * - Free Tier: Monthly credits (few hundred requests/hour)
 * - Model Size Limit: 10GB max for free tier
 * - Returns 429 when exceeding rate limits
 * - Billing: Pay-as-you-go based on compute time (after credits exhausted)
 * - Retry logic: 1s/2s/4s exponential backoff for 429/503/504
 */

async function callHuggingFace(req: LLMRequest, orchestrationRemainingMs?: number): Promise<LLMResponse> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not set');

  // ✅ 2025: Use official Inference API endpoint
  const model = 'mistralai/Mistral-7B-Instruct-v0.2';
  
  // Format prompt for Mistral
  const prompt = req.messages
    .map(m => {
      if (m.role === 'system') return `<s>[INST] ${m.content} [/INST]`;
      if (m.role === 'user') return `[INST] ${m.content} [/INST]`;
      return m.content;
    })
    .join('\n');

  // ✅ P2.4: Retry logic for rate limits (429) and transient errors (503/504)
  const maxRetries = 3;
  const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 🔥 P0.1 FIX: Cap timeout to orchestration remaining time
      const effectiveTimeout = orchestrationRemainingMs 
        ? Math.max(0, Math.min(orchestrationRemainingMs, 15000))
        : 15000;
      
      if (effectiveTimeout <= 0) {
        throw new TimeoutError(
          'No time remaining for HuggingFace request (orchestration deadline exceeded)',
          orchestrationRemainingMs || 0,
          'huggingface-llm'
        );
      }
      
      const controller = new AbortController();
      
      // 🚨 2025 MIGRATION: HuggingFace moved to router.huggingface.co (api-inference deprecated)
      // https://router.huggingface.co/hf-inference is the new official endpoint
      const response = await withTimeout(
        fetch(
          `https://router.huggingface.co/hf-inference/models/${model}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: {
                max_new_tokens: req.maxTokens || 1024,
                temperature: req.temperature ?? 0.7,
                top_p: req.topP ?? 0.9,
                return_full_text: false
              }
            }),
            signal: controller.signal
          }
        ),
        {
          timeoutMs: effectiveTimeout,
          operation: `huggingface-llm-attempt-${attempt + 1}`,
          abortController: controller,
          debug: true
        }
      );

      // ✅ P2.4: Enhanced error handling with detailed error messages
      if (!response.ok) {
        const errorText = await response.text();
        const error: any = new Error(`HuggingFace API error (${response.status}): ${errorText}`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();

      // ✅ P2.4: Token tracking (estimate tokens since HF doesn't provide usage stats)
      const promptLength = prompt.length;
      const responseText = data[0]?.generated_text || '';
      const responseLength = responseText.length;
      
      // Rough estimation: ~4 characters per token
      const promptTokens = Math.ceil(promptLength / 4);
      const completionTokens = Math.ceil(responseLength / 4);
      const totalTokens = promptTokens + completionTokens;
      
      // ✅ CRITICAL: Update HuggingFace limits (estimate + DB tracking)
      try {
        const { providerLimitsTracker } = await import('../services/provider-limits-tracker');
        await providerLimitsTracker.updateHuggingFaceLimits();
      } catch (trackerError: any) {
        log.warn({ component: 'huggingface', error: trackerError.message }, 'Failed to update HF limits (non-critical)');
      }
      
      // ✅ PRODUCTION: Track quota in PostgreSQL
      await apiQuotaRepository.incrementUsage('hf', 1, totalTokens);
      
      await trackTokenUsage({
        provider: 'huggingface',
        model: 'mistralai/Mistral-7B-Instruct-v0.2',
        promptTokens,
        completionTokens,
        totalTokens,
        // cost: not provided → huggingface is free tier (monthly credits), returns $0.00
        requestType: 'chat',
        success: true
      });

      return {
        text: responseText,
        provider: 'huggingface',
        model,
        tokensUsed: totalTokens
      };
    } catch (error: any) {
      lastError = error;
      
      // 🔥 P0.1 FIX: Treat TimeoutError as retryable (same as 429/503/504)
      const isTimeout = error instanceof TimeoutError;
      const isRetryable = isTimeout || error.status === 429 || error.status === 503 || error.status === 504;
      
      if (!isRetryable || attempt === maxRetries) {
        // Log timeout specifically for observability
        if (isTimeout) {
          log.error({ component: 'huggingface', attempt: attempt + 1, timeoutMs: error.timeoutMs }, 'HuggingFace request timed out');
        }
        throw error;
      }
      
      // Wait before retry
      const delay = retryDelays[attempt];
      const reason = isTimeout ? 'timeout' : `rate limit (${error.status})`;
      log.warn({ component: 'huggingface', status: error.status, attempt: attempt + 1, maxRetries, delay, reason }, 'HuggingFace call failed, retrying');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('HuggingFace API request failed after retries');
}

// ============================================================================
// OPENROUTER CLIENT
// ============================================================================

async function callOpenRouter(req: LLMRequest, orchestrationRemainingMs?: number): Promise<LLMResponse> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) throw new Error('OPEN_ROUTER_API_KEY not set');

  // 🔥 P0.1 FIX: Add retry logic + timeout (same pattern as Groq/HF)
  const maxRetries = 3;
  const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 🔥 P0.1 FIX: Cap timeout to orchestration remaining time
      const effectiveTimeout = orchestrationRemainingMs 
        ? Math.max(0, Math.min(orchestrationRemainingMs, 15000))
        : 15000;
      
      if (effectiveTimeout <= 0) {
        throw new TimeoutError(
          'No time remaining for OpenRouter request (orchestration deadline exceeded)',
          orchestrationRemainingMs || 0,
          'openrouter-llm'
        );
      }
      
      const controller = new AbortController();
      
      const response = await withTimeout(
        fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.REPLIT_DEPLOYMENT_URL || 'http://localhost:5000',
            'X-Title': 'AION Supreme'
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-3.1-8b-instruct:free',
            messages: req.messages,
            max_tokens: req.maxTokens || 1024,
            temperature: req.temperature ?? 0.7,
            top_p: req.topP ?? 0.9
          }),
          signal: controller.signal
        }),
        {
          timeoutMs: effectiveTimeout,
          operation: `openrouter-llm-attempt-${attempt + 1}`,
          abortController: controller,
          debug: true
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        const error: any = new Error(`OpenRouter API error (${response.status}): ${errorText}`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();

  // ✅ P2.2: OpenRouter cost calculated automatically via token-tracker
  const promptTokens = data.usage?.prompt_tokens || 0;
  const completionTokens = data.usage?.completion_tokens || 0;
  const totalTokens = data.usage?.total_tokens || 0;
  
  // ✅ CRITICAL: Update OpenRouter limits (API + DB tracking)
  try {
    const { providerLimitsTracker } = await import('../services/provider-limits-tracker');
    await providerLimitsTracker.updateOpenRouterLimits();
  } catch (trackerError: any) {
    log.warn({ component: 'openrouter', error: trackerError.message }, 'Failed to update OpenRouter limits (non-critical)');
  }
  
  // ✅ PRODUCTION: Track quota in PostgreSQL
  await apiQuotaRepository.incrementUsage('openrouter', 1, totalTokens);
  
  await trackTokenUsage({
    provider: 'openrouter',
    model: 'meta-llama/llama-3.1-8b-instruct:free', // Use full model name for pricing lookup
    promptTokens,
    completionTokens,
    totalTokens,
    // cost: not provided → calculated automatically from OPENROUTER_PRICING
    requestType: 'chat',
    success: true
  });

      return {
        text: data.choices[0].message.content,
        provider: 'openrouter',
        model: 'llama-3.1-8b-instruct',
        tokensUsed: totalTokens
      };
    } catch (error: any) {
      lastError = error;
      
      // 🔥 P0.1 FIX: Treat TimeoutError as retryable (same as 429/503/504)
      const isTimeout = error instanceof TimeoutError;
      const isRetryable = isTimeout || error.status === 429 || error.status === 503 || error.status === 504;
      
      if (!isRetryable || attempt === maxRetries) {
        // Log timeout specifically for observability
        if (isTimeout) {
          log.error({ component: 'openrouter', attempt: attempt + 1, timeoutMs: error.timeoutMs }, 'OpenRouter request timed out');
        }
        throw error;
      }
      
      // Wait before retry
      const delay = retryDelays[attempt];
      const reason = isTimeout ? 'timeout' : `rate limit (${error.status})`;
      log.warn({ component: 'openrouter', attempt: attempt + 1, maxRetries, delay, reason }, 'OpenRouter call failed, retrying');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('OpenRouter API request failed after retries');
}

// ============================================================================
// OPENAI FALLBACK (Last Resort - Paid)
// ============================================================================

async function callOpenAI(req: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',  // Cheapest model
    messages: req.messages,
    max_tokens: req.maxTokens || 1024,
    temperature: req.temperature ?? 0.7,
    top_p: req.topP ?? 0.9
  });

  // ✅ PRODUCTION: Track real usage from OpenAI API (PAID)
  const promptTokens = response.usage?.prompt_tokens || 0;
  const completionTokens = response.usage?.completion_tokens || 0;
  const totalTokens = response.usage?.total_tokens || 0;
  
  await trackTokenUsage({
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    promptTokens,
    completionTokens,
    totalTokens,
    // ✅ Real cost calculation (not mock!)
    requestType: 'chat',
    success: true
  });

  // 🔥 P0.1 FIX LSP: Extract tool calls with type guard (function calling)
  const toolCalls = response.choices[0].message.tool_calls?.map(tc => ({
    id: tc.id,
    name: ('function' in tc) ? tc.function.name : '',
    arguments: ('function' in tc) ? JSON.parse(tc.function.arguments) : {}
  }));

  return {
    text: response.choices[0].message.content || '',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    tokensUsed: totalTokens,
    toolCalls // Pass through tool calls (undefined if not present)
  };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

export async function generateWithFreeAPIs(
  req: LLMRequest,
  allowOpenAI: boolean = true,
  model?: string, // NEW: Specific model to use (passed to providers)
  forceProvider?: 'groq' | 'gemini' | 'hf' | 'openrouter' | 'openai' // NEW: Force specific provider (short-circuit fallback)
): Promise<LLMResponse> {
  // 🔥 P0.1 FIX: Orchestration deadline (30s total for entire fallback chain)
  const ORCHESTRATION_DEADLINE_MS = 30000;
  const startTime = Date.now();
  const errors: string[] = [];
  const failedProviders = new Set<string>();  // Track failed providers
  
  // 🔥 NEW: Force Provider Short-Circuit
  if (forceProvider) {
    console.log(`🎯 [FREE APIs] FORCE PROVIDER: ${forceProvider} (skipping fallback chain)`);
    
    // Quota check for forced provider
    const quotasFromDB = await getProviderQuotas();
    const quotaMap = new Map(quotasFromDB.map(q => [q.provider, q]));
    const quota = quotaMap.get(forceProvider);
    
    if (quota && quota.used >= quota.dailyLimit * 0.8) {
      throw new Error(`Forced provider ${forceProvider} has exceeded 80% quota (${quota.used}/${quota.dailyLimit})`);
    }
    
    // 🔥 P0.2: Circuit breaker check for forced provider
    const forcedBreaker = await llmCircuitBreakerManager.getBreaker(forceProvider);
    
    // 🔥 P0.2 FIX: Await canExecute (async state transitions)
    if (!(await forcedBreaker.canExecute())) {
      throw new Error(`Forced provider ${forceProvider} circuit breaker OPEN (too many recent failures)`);
    }
    
    // Call forced provider directly
    try {
      let response: LLMResponse;
      
      // 🔥 P0.1 FIX: Pass remainingMs even for forced provider
      const forcedRemainingMs = ORCHESTRATION_DEADLINE_MS - (Date.now() - startTime);
      
      switch (forceProvider) {
        case 'groq':
          response = await callGroq(req, forcedRemainingMs);
          break;
        case 'gemini':
          response = await callGemini(req, forcedRemainingMs);
          break;
        case 'hf':
          response = await callHuggingFace(req, forcedRemainingMs);
          break;
        case 'openrouter':
          response = await callOpenRouter(req, forcedRemainingMs);
          break;
        case 'openai':
          response = await callOpenAI(req);
          break;
        default:
          throw new Error(`Unknown forced provider: ${forceProvider}`);
      }
      
      const latency = Date.now() - startTime;
      console.log(`✅ [FREE APIs] Forced provider ${forceProvider} succeeded (${latency}ms)`);
      
      // 🔥 P0.2 FIX: Await success recording for DB persistence
      await forcedBreaker.recordSuccess();
      
      return {
        ...response,
        latencyMs: latency,
        costUsd: forceProvider === 'openai' ? (response.costUsd || 0) : 0, // Only OpenAI has cost
        finishReason: response.finishReason || 'stop',
      };
      
    } catch (error: any) {
      console.error(`❌ [FREE APIs] Forced provider ${forceProvider} failed:`, error.message);
      
      // 🔥 P0.2 FIX: Await failure recording for DB persistence
      await forcedBreaker.recordFailure(error.message);
      
      throw new Error(`Forced provider ${forceProvider} failed: ${error.message}`);
    }
  }
  
  // 🔥 FIX: Read quotas from DATABASE to avoid restart issues
  const quotasFromDB = await getProviderQuotas();
  const quotaMap = new Map(quotasFromDB.map(q => [q.provider, q]));
  
  // 🔥 DEBUG: Log all quota data to diagnose skipping issue
  console.log('🔍 [FREE APIs DEBUG] Quota map loaded:');
  for (const [providerName, quota] of Array.from(quotaMap.entries())) {
    console.log(`   ${providerName}: used=${quota.used}, limit=${quota.dailyLimit}, pct=${quota.percentage.toFixed(1)}%`);
  }
  
  // Get all enabled providers sorted by priority
  const sortedProviders = FREE_APIS
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  console.log(`🔍 [FREE APIs DEBUG] Attempting ${sortedProviders.length} enabled providers:`, sortedProviders.map(p => p.name).join(', '));

  // Try each provider ONCE in priority order
  for (const provider of sortedProviders) {
    // Skip if already failed
    if (failedProviders.has(provider.name)) {
      console.log(`   ⏭️  Skipping ${provider.name} - already failed`);
      continue;
    }
    
    // 🔥 P0.1 FIX: Check orchestration deadline BEFORE starting provider attempt
    const elapsedMs = Date.now() - startTime;
    const remainingMs = ORCHESTRATION_DEADLINE_MS - elapsedMs;
    
    // If deadline exceeded, throw TimeoutError immediately
    if (remainingMs <= 0) {
      log.error({ component: 'free-apis', elapsedMs, deadlineMs: ORCHESTRATION_DEADLINE_MS }, 
        'Orchestration deadline exceeded before provider attempt');
      throw new TimeoutError(
        `LLM orchestration exceeded ${ORCHESTRATION_DEADLINE_MS}ms deadline (elapsed: ${elapsedMs}ms)`,
        ORCHESTRATION_DEADLINE_MS,
        'free-apis-orchestration'
      );
    }
    
    // 🔥 FIX: Check quota from DATABASE (not in-memory stats)
    const quota = quotaMap.get(provider.name);
    console.log(`🔍 [FREE APIs DEBUG] Checking ${provider.name} quota:`, quota ? `used=${quota.used}, limit=${quota.dailyLimit}, threshold=${quota.dailyLimit * 0.8}` : 'NOT FOUND IN QUOTA MAP!');
    
    if (quota && quota.used >= quota.dailyLimit * 0.8) {
      log.warn({ component: 'free-apis', provider: provider.name, used: quota.used, limit: quota.dailyLimit }, 'Provider over 80% quota, skipping');
      console.log(`   ⛔ Skipping ${provider.name} - over 80% quota (${quota.used}/${quota.dailyLimit})`);
      continue;
    }
    
    console.log(`   ✅ Trying ${provider.name} - quota OK (${remainingMs}ms remaining of ${ORCHESTRATION_DEADLINE_MS}ms deadline)`);

    // 🔥 P0.2: Circuit breaker check BEFORE calling provider
    const breaker = await llmCircuitBreakerManager.getBreaker(provider.name);
    
    // 🔥 P0.2 FIX: Await canExecute (async state transitions)
    if (!(await breaker.canExecute())) {
      log.warn({
        component: 'free-apis',
        provider: provider.name,
        circuitState: breaker.getStats().state,
      }, 'Circuit OPEN - skipping provider');
      
      console.log(`   ⚡ Circuit breaker OPEN for ${provider.name} - skipping`);
      
      // Mark as failed and try next provider
      failedProviders.add(provider.name);
      errors.push(`${provider.name}: circuit breaker OPEN (too many recent failures)`);
      continue;
    }

    try {
      log.info({ component: 'free-apis', provider: provider.name }, 'Trying provider');
      
      let response: LLMResponse;
      
      // 🔥 P0.1 FIX: Pass remainingMs to provider to cap timeout
      const providerRemainingMs = ORCHESTRATION_DEADLINE_MS - (Date.now() - startTime);
      
      switch (provider.name) {
        case 'groq':
          response = await callGroq(req, providerRemainingMs);
          break;
        case 'gemini':
          response = await callGemini(req, providerRemainingMs);
          break;
        case 'hf':  // 🔥 FIX: Match the actual provider name in FREE_APIS array
        case 'huggingface':  // Also accept 'huggingface' for compatibility
          response = await callHuggingFace(req, providerRemainingMs);
          break;
        case 'openrouter':
          response = await callOpenRouter(req, providerRemainingMs);
          break;
        default:
          throw new Error(`Unknown provider: ${provider.name}`);
      }

      const latency = Date.now() - startTime;
      log.info({ component: 'free-apis', provider: provider.name, latency }, 'Provider succeeded');
      
      // 🔥 P0.2 FIX: Await success recording for DB persistence
      await breaker.recordSuccess();
      
      return response;
      
    } catch (error: any) {
      // 🔥 FIX: Enhanced error debugging with FULL STACK TRACE
      log.error({ 
        component: 'free-apis', 
        provider: provider.name,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
        errorKeys: error ? Object.keys(error) : [],
        errorStack: error?.stack || 'No stack trace',
        errorMessage: error?.message,
        rawError: error
      }, 'Provider failed - FULL ERROR DETAILS + STACK TRACE');
      
      // 🔥 FIX: Safely extract error message (handle both Error objects and strings)
      let errorMessage = 'Unknown error';
      try {
        if (error?.message) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error?.toString && typeof error.toString === 'function') {
          errorMessage = error.toString();
        } else {
          errorMessage = JSON.stringify(error);
        }
      } catch (stringifyError) {
        errorMessage = 'Error occurred but could not be stringified';
      }
      
      const errorMsg = `${provider.name}: ${errorMessage}`;
      errors.push(errorMsg);
      log.error({ component: 'free-apis', provider: provider.name, error: errorMessage }, 'Provider failed');
      
      // 🔥 P0.2 FIX: Await failure recording for DB persistence
      await breaker.recordFailure(errorMessage);
      
      // Mark this provider as failed and try next one
      failedProviders.add(provider.name);
      continue;
    }
  }

  // 🔥 P0.1 FIX: Check deadline one final time before OpenAI fallback
  const finalElapsedMs = Date.now() - startTime;
  if (finalElapsedMs >= ORCHESTRATION_DEADLINE_MS) {
    log.error({ component: 'free-apis', elapsedMs: finalElapsedMs, deadlineMs: ORCHESTRATION_DEADLINE_MS }, 
      'Orchestration deadline exceeded after provider loop');
    throw new TimeoutError(
      `LLM orchestration exceeded ${ORCHESTRATION_DEADLINE_MS}ms deadline (elapsed: ${finalElapsedMs}ms)`,
      ORCHESTRATION_DEADLINE_MS,
      'free-apis-orchestration'
    );
  }

  // All free APIs failed - fallback to OpenAI if allowed
  if (allowOpenAI) {
    log.warn({ 
      component: 'free-apis',
      failedProviders: Array.from(failedProviders),
      errors
    }, '💸 ALL FREE APIs FAILED - Falling back to PAID OpenAI');
    
    try {
      return await callOpenAI(req);
    } catch (error: any) {
      errors.push(`openai: ${error.message}`);
      throw new Error(`All LLM providers failed: ${errors.join('; ')}`);
    }
  }

  throw new Error(`All free LLM providers failed: ${errors.join('; ')}`);
}

// ============================================================================
// USAGE STATISTICS (PostgreSQL-backed)
// ============================================================================

export async function getUsageStats() {
  const quotas = await apiQuotaRepository.getAllQuotas();
  
  return {
    providers: quotas.map(q => ({
      name: q.provider,
      enabled: FREE_APIS.find(p => p.name === q.provider)?.enabled ?? false,
      dailyLimit: q.dailyRequestLimit,
      used: q.requestCount,
      remaining: q.dailyRequestLimit - q.requestCount,
      percentUsed: (q.requestCount / q.dailyRequestLimit) * 100
    })),
    totalCapacity: quotas.reduce((sum, q) => sum + q.dailyRequestLimit, 0),
    totalUsed: quotas.reduce((sum, q) => sum + q.requestCount, 0)
  };
}
