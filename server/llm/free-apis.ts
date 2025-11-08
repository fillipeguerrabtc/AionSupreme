/**
 * AION Supreme - Free LLM APIs Rotation System
 * Total Capacity: 27,170 requests/day GRATIS
 * Priority: Groq → Gemini → HuggingFace → OpenRouter → OpenAI (last resort)
 */

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getProviderQuotas, trackTokenUsage } from '../monitoring/token-tracker';

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
  dailyLimit: number;
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
    dailyLimit: 14400,  // 14.4k requests/day
    priority: 1,        // HIGHEST priority (ultra-fast, no censorship)
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],  // Updated Oct 2025
    enabled: !!process.env.GROQ_API_KEY
  },
  {
    name: 'gemini',
    dailyLimit: 6000000,  // 6M tokens/day (~12k requests @ 500 tokens/req)
    priority: 2,
    models: ['gemini-2.0-flash-exp', 'gemini-1.5-flash'],
    enabled: !!process.env.GEMINI_API_KEY
  },
  {
    name: 'huggingface',
    dailyLimit: 720,    // ~720 requests/day (estimated)
    priority: 3,
    models: ['mistralai/Mistral-7B-Instruct-v0.3'],
    enabled: !!process.env.HUGGINGFACE_API_KEY
  },
  {
    name: 'openrouter',
    dailyLimit: 50,     // 50 free credits
    priority: 4,
    models: ['meta-llama/llama-3.1-8b-instruct:free', 'mistralai/mistral-7b-instruct:free'],
    enabled: !!process.env.OPENROUTER_API_KEY
  }
];

// Usage tracking
const usageStats = {
  groq: { today: 0, lastReset: new Date().toDateString() },
  gemini: { today: 0, lastReset: new Date().toDateString() },
  huggingface: { today: 0, lastReset: new Date().toDateString() },
  openrouter: { today: 0, lastReset: new Date().toDateString() }
};

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

  const groq = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1'
  });

  // ✅ P2.3: Retry logic for rate limits (429) and transient errors (503/504)
  const maxRetries = 3;
  const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',  // Updated Oct 2025 - replaces deprecated llama-3.1-70b-versatile
        messages: req.messages,
        max_tokens: req.maxTokens || 1024,
        temperature: req.temperature || 0.7,
        top_p: req.topP || 0.9
      });

      usageStats.groq.today++;

      // ✅ PRODUCTION: Track real usage from Groq API
      const promptTokens = response.usage?.prompt_tokens || 0;
      const completionTokens = response.usage?.completion_tokens || 0;
      const totalTokens = response.usage?.total_tokens || 0;
      
      // ✅ P2.2: Groq is FREE tier → cost calculated as $0.00
      await trackTokenUsage({
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        promptTokens,
        completionTokens,
        totalTokens,
        // cost: not provided → groq is free tier, returns $0.00
        requestType: 'chat',
        success: true
      });

      return {
        text: response.choices[0].message.content || '',
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
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
      console.log(`[Groq] Rate limit hit (429), retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached, but TypeScript needs it
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
      temperature: req.temperature || 0.7,
      topP: req.topP || 0.9,
      maxOutputTokens: req.maxTokens || 1024
    }
  });

  // Convert messages to Gemini format
  const systemPrompt = req.messages.find(m => m.role === 'system')?.content || '';
  const conversationHistory = req.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const chat = model.startChat({
    history: conversationHistory.slice(0, -1),
    systemInstruction: systemPrompt
  });

  const lastMessage = conversationHistory[conversationHistory.length - 1];
  const result = await chat.sendMessage(lastMessage.parts[0].text);
  const response = result.response;

  usageStats.gemini.today++;

  // ✅ PRODUCTION: Track real usage from Gemini API
  const promptTokens = response.usageMetadata?.promptTokenCount || 0;
  const completionTokens = response.usageMetadata?.candidatesTokenCount || 0;
  const totalTokens = response.usageMetadata?.totalTokenCount || 0;
  
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

  const model = 'mistralai/Mistral-7B-Instruct-v0.3';
  
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
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
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
              temperature: req.temperature || 0.7,
              top_p: req.topP || 0.9,
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
      usageStats.huggingface.today++;

      // ✅ P2.4: Token tracking (estimate tokens since HF doesn't provide usage stats)
      const promptLength = prompt.length;
      const responseText = data[0]?.generated_text || '';
      const responseLength = responseText.length;
      
      // Rough estimation: ~4 characters per token
      const promptTokens = Math.ceil(promptLength / 4);
      const completionTokens = Math.ceil(responseLength / 4);
      const totalTokens = promptTokens + completionTokens;
      
      await trackTokenUsage({
        provider: 'huggingface',
        model: 'mistralai/Mistral-7B-Instruct-v0.3',
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
      console.log(`[HuggingFace] Rate limit hit (${error.status}), retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
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
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

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
      temperature: req.temperature || 0.7,
      top_p: req.topP || 0.9
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`);
  }

  const data = await response.json();
  usageStats.openrouter.today++;

  // ✅ P2.2: OpenRouter cost calculated automatically via token-tracker
  const promptTokens = data.usage?.prompt_tokens || 0;
  const completionTokens = data.usage?.completion_tokens || 0;
  const totalTokens = data.usage?.total_tokens || 0;
  
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
    temperature: req.temperature || 0.7,
    top_p: req.topP || 0.9
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
// ROTATION LOGIC
// ============================================================================

function resetDailyCountsIfNeeded() {
  const today = new Date().toDateString();
  
  for (const provider of Object.keys(usageStats)) {
    const stats = usageStats[provider as keyof typeof usageStats];
    if (stats.lastReset !== today) {
      stats.today = 0;
      stats.lastReset = today;
    }
  }
}

function getNextAvailableProvider(): APIProvider | null {
  resetDailyCountsIfNeeded();
  
  // Sort by priority
  const sortedProviders = FREE_APIS
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);
  
  for (const provider of sortedProviders) {
    const stats = usageStats[provider.name as keyof typeof usageStats];
    
    // Check if under limit (80% threshold for safety)
    if (stats.today < provider.dailyLimit * 0.8) {
      return provider;
    }
  }
  
  return null; // All free APIs exhausted
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

  resetDailyCountsIfNeeded();
  
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
      console.log(`[FREE-APIs] ${provider.name} over 80% quota (${quota.used}/${quota.dailyLimit}) - skipping`);
      continue;
    }

    try {
      console.log(`[FREE-APIs] Trying ${provider.name}...`);
      
      let response: LLMResponse;
      
      switch (provider.name) {
        case 'groq':
          response = await callGroq(req);
          break;
        case 'gemini':
          response = await callGemini(req);
          break;
        case 'huggingface':
          response = await callHuggingFace(req);
          break;
        case 'openrouter':
          response = await callOpenRouter(req);
          break;
        default:
          throw new Error(`Unknown provider: ${provider.name}`);
      }

      const latency = Date.now() - startTime;
      console.log(`[FREE-APIs] ✓ ${provider.name} succeeded in ${latency}ms`);
      
      return response;
      
    } catch (error: any) {
      const errorMsg = `${provider.name}: ${error.message}`;
      errors.push(errorMsg);
      console.error(`[FREE-APIs] ✗ ${errorMsg}`);
      
      // Mark this provider as failed and try next one
      failedProviders.add(provider.name);
      continue;
    }
  }

  // All free APIs failed - fallback to OpenAI if allowed
  if (allowOpenAI) {
    console.log('[FREE-APIs] Falling back to OpenAI (paid)...');
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
// USAGE STATISTICS
// ============================================================================

export function getUsageStats() {
  resetDailyCountsIfNeeded();
  
  return {
    providers: FREE_APIS.map(p => ({
      name: p.name,
      enabled: p.enabled,
      dailyLimit: p.dailyLimit,
      used: usageStats[p.name as keyof typeof usageStats].today,
      remaining: p.dailyLimit - usageStats[p.name as keyof typeof usageStats].today,
      percentUsed: (usageStats[p.name as keyof typeof usageStats].today / p.dailyLimit) * 100
    })),
    totalCapacity: FREE_APIS.reduce((sum, p) => sum + p.dailyLimit, 0),
    totalUsed: Object.values(usageStats).reduce((sum, s) => sum + s.today, 0)
  };
}
