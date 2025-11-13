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

async function callGroq(req: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  // ✅ CRITICAL: Use fetch to capture response headers (OpenAI SDK doesn't expose them)
  const maxRetries = 3;
  const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
        })
      });

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
      
      // ✅ CRITICAL: Update provider limits from REAL headers (non-blocking, never fail response)
      try {
        const { providerLimitsTracker } = await import('../services/provider-limits-tracker');
        await providerLimitsTracker.updateGroqLimits(headers);
      } catch (trackerError: any) {
        log.warn({ component: 'groq', error: trackerError.message }, 'Failed to update provider limits (non-critical)');
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
      
      // Check if error is retryable (429, 503, 504)
      const isRetryable = error.status === 429 || error.status === 503 || error.status === 504;
      
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry
      const delay = retryDelays[attempt];
      log.warn({ component: 'groq', attempt: attempt + 1, maxRetries, delay }, 'Rate limit hit, retrying');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Groq API request failed after retries');
}


// ============================================================================
// GEMINI CLIENT
// ============================================================================

async function callGemini(req: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      topP: req.topP ?? 0.9,
      maxOutputTokens: req.maxTokens || 1024
    }
  });

  // Convert messages to Gemini format
  const systemPrompt = req.messages.find(m => m.role === 'system')?.content || '';
  
  // ✅ ROBUST FIX: Gemini systemInstruction is unstable with long prompts
  // If > 800 chars (safe margin below 1000), move ENTIRE system prompt to first message
  const MAX_SAFE_SYSTEM_LENGTH = 800;
  let finalSystemPrompt: string | undefined = undefined;
  let prependToFirstMessage = '';
  
  if (systemPrompt.length > MAX_SAFE_SYSTEM_LENGTH) {
    // Move ENTIRE system prompt to first message for reliability
    prependToFirstMessage = systemPrompt;
    log.warn({ 
      component: 'gemini', 
      originalLength: systemPrompt.length, 
      maxSafe: MAX_SAFE_SYSTEM_LENGTH
    }, 'System prompt exceeds safe limit - moving ENTIRE prompt to first message');
  } else if (systemPrompt.length > 0) {
    finalSystemPrompt = systemPrompt;
  }
  
  const conversationHistory = req.messages
    .filter(m => m.role !== 'system')
    .map((m, index) => {
      // Prepend full system prompt to first user message if needed
      if (index === 0 && m.role === 'user' && prependToFirstMessage) {
        return {
          role: 'user',
          parts: [{ text: `SYSTEM INSTRUCTIONS:\n${prependToFirstMessage}\n\n---\n\nUSER MESSAGE:\n${m.content}` }]
        };
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      };
    });

  const chat = model.startChat({
    history: conversationHistory.slice(0, -1),
    systemInstruction: finalSystemPrompt  // Only send if < 800 chars
  });

  const lastMessage = conversationHistory[conversationHistory.length - 1];
  const result = await chat.sendMessage(lastMessage.parts[0].text);
  const response = result.response;

  // ✅ PRODUCTION: Track real usage from Gemini API
  const promptTokens = response.usageMetadata?.promptTokenCount || 0;
  const completionTokens = response.usageMetadata?.candidatesTokenCount || 0;
  const totalTokens = response.usageMetadata?.totalTokenCount || 0;
  
  // ✅ PRODUCTION: Track quota in PostgreSQL
  await apiQuotaRepository.incrementUsage('gemini', 1, totalTokens);
  
  // ✅ P2.2: Cost calculated automatically via token-tracker (2025 pricing)
  await trackTokenUsage({
    provider: 'gemini',
    model: 'gemini-2.0-flash-exp',
    promptTokens,
    completionTokens,
    totalTokens,
    // cost: not provided → calculated automatically from GEMINI_PRICING
    requestType: 'chat',
    success: true
  });

  return {
    text: response.text(),
    provider: 'gemini',
    model: 'gemini-2.0-flash-exp',
    tokensUsed: totalTokens
  };
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

async function callHuggingFace(req: LLMRequest): Promise<LLMResponse> {
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
      // 🚨 2025 MIGRATION: HuggingFace moved to router.huggingface.co (api-inference deprecated)
      // https://router.huggingface.co/hf-inference is the new official endpoint
      const response = await fetch(
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
          })
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
      
      // Check if error is retryable (429, 503, 504)
      const isRetryable = error.status === 429 || error.status === 503 || error.status === 504;
      
      if (!isRetryable || attempt === maxRetries) {
        // Non-retryable error or max retries reached
        throw error;
      }
      
      // Wait before retry
      const delay = retryDelays[attempt];
      log.warn({ component: 'huggingface', status: error.status, attempt: attempt + 1, maxRetries, delay }, 'Rate limit hit, retrying');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('HuggingFace API request failed after retries');
}

// ============================================================================
// OPENROUTER CLIENT
// ============================================================================

async function callOpenRouter(req: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) throw new Error('OPEN_ROUTER_API_KEY not set');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`);
  }

  const data = await response.json();

  // ✅ P2.2: OpenRouter cost calculated automatically via token-tracker
  const promptTokens = data.usage?.prompt_tokens || 0;
  const completionTokens = data.usage?.completion_tokens || 0;
  const totalTokens = data.usage?.total_tokens || 0;
  
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

  return {
    text: response.choices[0].message.content || '',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    tokensUsed: totalTokens
  };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

export async function generateWithFreeAPIs(
  req: LLMRequest,
  allowOpenAI: boolean = true
): Promise<LLMResponse> {
  const startTime = Date.now();
  const errors: string[] = [];
  const failedProviders = new Set<string>();  // Track failed providers
  
  // 🔥 FIX: Read quotas from DATABASE to avoid restart issues
  const quotasFromDB = await getProviderQuotas();
  const quotaMap = new Map(quotasFromDB.map(q => [q.provider, q]));
  
  // Get all enabled providers sorted by priority
  const sortedProviders = FREE_APIS
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  // Try each provider ONCE in priority order
  for (const provider of sortedProviders) {
    // Skip if already failed
    if (failedProviders.has(provider.name)) continue;
    
    // 🔥 FIX: Check quota from DATABASE (not in-memory stats)
    const quota = quotaMap.get(provider.name);
    if (quota && quota.used >= quota.dailyLimit * 0.8) {
      log.warn({ component: 'free-apis', provider: provider.name, used: quota.used, limit: quota.dailyLimit }, 'Provider over 80% quota, skipping');
      continue;
    }

    try {
      log.info({ component: 'free-apis', provider: provider.name }, 'Trying provider');
      
      let response: LLMResponse;
      
      switch (provider.name) {
        case 'groq':
          response = await callGroq(req);
          break;
        case 'gemini':
          response = await callGemini(req);
          break;
        case 'hf':  // 🔥 FIX: Match the actual provider name in FREE_APIS array
        case 'huggingface':  // Also accept 'huggingface' for compatibility
          response = await callHuggingFace(req);
          break;
        case 'openrouter':
          response = await callOpenRouter(req);
          break;
        default:
          throw new Error(`Unknown provider: ${provider.name}`);
      }

      const latency = Date.now() - startTime;
      log.info({ component: 'free-apis', provider: provider.name, latency }, 'Provider succeeded');
      
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
      
      // Mark this provider as failed and try next one
      failedProviders.add(provider.name);
      continue;
    }
  }

  // All free APIs failed - DO NOT fallback to OpenAI automatically
  // 🚨 PRODUCTION SAFETY: Never auto-fallback to paid OpenAI
  // User must explicitly enable OpenAI fallback per-request basis
  log.error({ 
    component: 'free-apis', 
    failedProviders: Array.from(failedProviders),
    errors
  }, '🚨 ALL FREE APIs FAILED - Refusing to auto-fallback to OpenAI (cost protection)');
  
  // ❌ DISABLED: Automatic OpenAI fallback (causes cost spiral)
  // if (allowOpenAI) {
  //   log.info({ component: 'free-apis' }, 'Falling back to OpenAI (paid)');
  //   try {
  //     return await callOpenAI(req);
  //   } catch (error: any) {
  //     errors.push(`openai: ${error.message}`);
  //     throw new Error(`All LLM providers failed: ${errors.join('; ')}`);
  //   }
  // }

  throw new Error(`❌ All free LLM providers failed. OpenAI fallback is disabled to prevent cost spiral. Errors: ${errors.join('; ')}`);
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
