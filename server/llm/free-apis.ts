/**
 * AION Supreme - Free LLM APIs Rotation System
 * Total Capacity: 27,170 requests/day GRATIS
 * Priority: Groq → Gemini → HuggingFace → OpenRouter → OpenAI (last resort)
 */

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

async function callGroq(req: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const groq = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1'
  });

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',  // Updated Oct 2025 - replaces deprecated llama-3.1-70b-versatile
    messages: req.messages,
    max_tokens: req.maxTokens || 1024,
    temperature: req.temperature || 0.7,
    top_p: req.topP || 0.9
  });

  usageStats.groq.today++;

  return {
    text: response.choices[0].message.content || '',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    tokensUsed: response.usage?.total_tokens
  };
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

  return {
    text: response.text(),
    provider: 'gemini',
    model: 'gemini-2.0-flash-exp',
    tokensUsed: response.usageMetadata?.totalTokenCount
  };
}

// ============================================================================
// HUGGINGFACE CLIENT
// ============================================================================

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

  if (!response.ok) {
    throw new Error(`HuggingFace API error: ${response.statusText}`);
  }

  const data = await response.json();
  usageStats.huggingface.today++;

  return {
    text: data[0].generated_text,
    provider: 'huggingface',
    model
  };
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

  return {
    text: data.choices[0].message.content,
    provider: 'openrouter',
    model: 'llama-3.1-8b-instruct',
    tokensUsed: data.usage?.total_tokens
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

  return {
    text: response.choices[0].message.content || '',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    tokensUsed: response.usage?.total_tokens
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
  
  // Get all enabled providers sorted by priority
  const sortedProviders = FREE_APIS
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  // Try each provider ONCE in priority order
  for (const provider of sortedProviders) {
    // Skip if already failed or over limit
    if (failedProviders.has(provider.name)) continue;
    
    const stats = usageStats[provider.name as keyof typeof usageStats];
    if (stats.today >= provider.dailyLimit * 0.8) {
      console.log(`[FREE-APIs] ${provider.name} over limit (${stats.today}/${provider.dailyLimit})`);
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
