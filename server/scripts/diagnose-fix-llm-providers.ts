/**
 * 🔥 CRITICAL FIX: Diagnose and Fix LLM Provider Circuit Breakers
 * 
 * PROBLEM: All free providers (Groq, Gemini, OpenRouter) have OPEN circuit breakers
 * RESULT: System falling back to OpenAI 19x more than Groq (1,305 vs 68 calls/24h)
 * COST IMPACT: Paying OpenAI unnecessarily despite having free API quotas
 * 
 * This script:
 * 1. Tests each free API directly with simple request
 * 2. Identifies which APIs work vs which have real issues
 * 3. Resets circuit breakers for working APIs
 * 4. Reports failed APIs with error details
 * 5. Removes HuggingFace completely (endpoint 410 Gone)
 */

import { db } from '../db';
import { llmCircuitBreakerState } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { log } from '../utils/logger';

interface TestResult {
  provider: string;
  success: boolean;
  error?: string;
  latencyMs?: number;
  model?: string;
}

async function testGroq(): Promise<TestResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return { provider: 'groq', success: false, error: 'GROQ_API_KEY not set' };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 10,
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const error = await response.text();
      return { 
        provider: 'groq', 
        success: false, 
        error: `HTTP ${response.status}: ${error.slice(0, 200)}` 
      };
    }

    const data = await response.json();
    return {
      provider: 'groq',
      success: true,
      latencyMs: Date.now() - start,
      model: 'llama-3.3-70b-versatile'
    };
  } catch (error: any) {
    return { 
      provider: 'groq', 
      success: false, 
      error: error.message || String(error) 
    };
  }
}

async function testGemini(): Promise<TestResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { provider: 'gemini', success: false, error: 'GEMINI_API_KEY not set' };

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const result = await model.generateContent('Say OK');
    const text = result.response.text();

    return {
      provider: 'gemini',
      success: true,
      latencyMs: Date.now() - start,
      model: 'gemini-2.0-flash-exp'
    };
  } catch (error: any) {
    return { 
      provider: 'gemini', 
      success: false, 
      error: error.message || String(error) 
    };
  }
}

async function testOpenRouter(): Promise<TestResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.OPEN_ROUTER_API_KEY;
    if (!apiKey) return { provider: 'openrouter', success: false, error: 'OPEN_ROUTER_API_KEY not set' };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aion-ai.replit.app',
        'X-Title': 'AION AI System'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 10,
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const error = await response.text();
      return { 
        provider: 'openrouter', 
        success: false, 
        error: `HTTP ${response.status}: ${error.slice(0, 200)}` 
      };
    }

    const data = await response.json();
    return {
      provider: 'openrouter',
      success: true,
      latencyMs: Date.now() - start,
      model: 'meta-llama/llama-3.1-8b-instruct:free'
    };
  } catch (error: any) {
    return { 
      provider: 'openrouter', 
      success: false, 
      error: error.message || String(error) 
    };
  }
}

async function resetCircuitBreaker(providerId: string): Promise<void> {
  await db
    .insert(llmCircuitBreakerState)
    .values({
      providerId,
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      lastSuccessTime: new Date(),
      nextRetryTime: null,
      config: {
        failureThreshold: 3,
        recoveryTimeout: 12000,
        successThreshold: 2,
        timeout: 15000,
      },
    })
    .onConflictDoUpdate({
      target: llmCircuitBreakerState.providerId,
      set: {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        lastSuccessTime: new Date(),
        nextRetryTime: null,
        updatedAt: new Date(),
      },
    });
}

async function removeHuggingFace(): Promise<void> {
  // Remove HF circuit breaker entry
  await db.delete(llmCircuitBreakerState).where(eq(llmCircuitBreakerState.providerId, 'hf'));
  log.info({ component: 'diagnose-fix-llm' }, 'Removed HuggingFace circuit breaker (endpoint deprecated)');
}

async function main() {
  log.info({ component: 'diagnose-fix-llm' }, '🔍 Starting LLM Provider Diagnostics...');

  // Test all free APIs in parallel
  log.info({ component: 'diagnose-fix-llm' }, 'Testing free APIs...');
  const [groqResult, geminiResult, openrouterResult] = await Promise.all([
    testGroq(),
    testGemini(),
    testOpenRouter()
  ]);

  const results = [groqResult, geminiResult, openrouterResult];

  // Report results
  console.log('\n📊 Test Results:');
  console.log('================');
  for (const result of results) {
    const status = result.success ? '✅ WORKING' : '❌ FAILED';
    console.log(`${status} ${result.provider.toUpperCase()}`);
    if (result.success) {
      console.log(`   ↳ Latency: ${result.latencyMs}ms, Model: ${result.model}`);
    } else {
      console.log(`   ↳ Error: ${result.error}`);
    }
  }

  // Reset circuit breakers for working APIs
  const workingProviders = results.filter(r => r.success).map(r => r.provider);
  const failedProviders = results.filter(r => !r.success).map(r => r.provider);

  if (workingProviders.length > 0) {
    console.log(`\n🔧 Resetting circuit breakers for: ${workingProviders.join(', ')}`);
    for (const provider of workingProviders) {
      await resetCircuitBreaker(provider);
      log.info({ component: 'diagnose-fix-llm', provider }, 'Circuit breaker RESET to CLOSED');
    }
  }

  if (failedProviders.length > 0) {
    console.log(`\n⚠️  Failed providers (circuit breaker remains OPEN): ${failedProviders.join(', ')}`);
  }

  // Remove HuggingFace
  console.log('\n🗑️  Removing HuggingFace (endpoint 410 Gone)...');
  await removeHuggingFace();

  // Final status
  console.log('\n✅ Diagnostics Complete!');
  console.log(`   Working: ${workingProviders.length}/3 free providers`);
  console.log(`   Failed: ${failedProviders.length}/3 free providers`);
  
  if (workingProviders.length > 0) {
    console.log('\n🎯 Next LLM requests will use free APIs first!');
    console.log('   Priority: Groq → Gemini → OpenRouter → OpenAI (last resort)');
  } else {
    console.log('\n⚠️  WARNING: All free APIs failed! System will use OpenAI.');
    console.log('   Check API keys and network connectivity.');
  }
}

main()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
