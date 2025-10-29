/**
 * AION Supreme - Token Usage Tracking Service
 * Real-time monitoring of token consumption across all APIs
 */

import { db } from '../db';
import { tokenUsage, tokenLimits, tokenAlerts, type InsertTokenUsage, type InsertTokenAlert } from '@shared/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface TokenTrackingData {
  tenantId: number;
  provider: 'groq' | 'gemini' | 'huggingface' | 'openrouter' | 'openai' | 'kb';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  requestType: 'chat' | 'embedding' | 'transcription' | 'image';
  success: boolean;
}

export interface UsageSummary {
  provider: string;
  today: {
    tokens: number;
    requests: number;
    cost: number;
    errors: number;
  };
  month: {
    tokens: number;
    requests: number;
    cost: number;
  };
  limits?: {
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    dailyCostLimit: number | null;
    monthlyCostLimit: number | null;
  };
  status: 'ok' | 'warning' | 'critical';
  percentage: number; // 0-100
}

export interface ProviderQuota {
  provider: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  percentage: number;
  resetTime: Date;
}

// ============================================================================
// COST CALCULATION (OpenAI pricing)
// ============================================================================

const OPENAI_PRICING = {
  'gpt-4o': { prompt: 0.005, completion: 0.015 }, // per 1K tokens
  'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
  'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
  'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
  'text-embedding-3-small': { prompt: 0.00002, completion: 0 },
  'text-embedding-3-large': { prompt: 0.00013, completion: 0 },
  'whisper-1': { prompt: 0, completion: 0.006 }, // per minute
  'dall-e-3': { prompt: 0, completion: 0.04 } // per image
};

function calculateCost(provider: string, model: string, promptTokens: number, completionTokens: number): number {
  if (provider !== 'openai') return 0;
  
  const pricing = OPENAI_PRICING[model as keyof typeof OPENAI_PRICING];
  if (!pricing) return 0;
  
  const promptCost = (promptTokens / 1000) * pricing.prompt;
  const completionCost = (completionTokens / 1000) * pricing.completion;
  
  return promptCost + completionCost;
}

// ============================================================================
// TOKEN TRACKING
// ============================================================================

export async function trackTokenUsage(data: TokenTrackingData): Promise<void> {
  const cost = data.cost ?? calculateCost(data.provider, data.model, data.promptTokens, data.completionTokens);
  
  // Insert usage record
  await db.insert(tokenUsage).values({
    tenantId: data.tenantId,
    provider: data.provider,
    model: data.model,
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    totalTokens: data.totalTokens,
    cost,
    requestType: data.requestType,
    success: data.success
  });
  
  // Check limits and send alerts if necessary
  await checkLimitsAndAlert(data.tenantId, data.provider);
}

// ============================================================================
// USAGE SUMMARY
// ============================================================================

export async function getUsageSummary(tenantId: number): Promise<UsageSummary[]> {
  const providers = ['groq', 'gemini', 'huggingface', 'openrouter', 'openai', 'kb'];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const summaries: UsageSummary[] = [];
  
  for (const provider of providers) {
    // Get today's usage
    const todayUsage = await db
      .select({
        tokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
        requests: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${tokenUsage.cost}), 0)`,
        errors: sql<number>`COALESCE(SUM(CASE WHEN ${tokenUsage.success} = false THEN 1 ELSE 0 END), 0)`
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.tenantId, tenantId),
          eq(tokenUsage.provider, provider),
          gte(tokenUsage.timestamp, todayStart)
        )
      );
    
    // Get month's usage
    const monthUsage = await db
      .select({
        tokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
        requests: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${tokenUsage.cost}), 0)`
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.tenantId, tenantId),
          eq(tokenUsage.provider, provider),
          gte(tokenUsage.timestamp, monthStart)
        )
      );
    
    // Get limits
    const limits = await db
      .select()
      .from(tokenLimits)
      .where(
        and(
          eq(tokenLimits.tenantId, tenantId),
          eq(tokenLimits.provider, provider)
        )
      )
      .limit(1);
    
    const limit = limits[0];
    const todayData = todayUsage[0];
    const monthData = monthUsage[0];
    
    // Calculate status
    let status: 'ok' | 'warning' | 'critical' = 'ok';
    let percentage = 0;
    
    if (limit?.dailyTokenLimit) {
      percentage = (Number(todayData.tokens) / limit.dailyTokenLimit) * 100;
      if (percentage >= 100) status = 'critical';
      else if (percentage >= (limit.alertThreshold * 100)) status = 'warning';
    }
    
    summaries.push({
      provider,
      today: {
        tokens: Number(todayData.tokens),
        requests: Number(todayData.requests),
        cost: Number(todayData.cost),
        errors: Number(todayData.errors)
      },
      month: {
        tokens: Number(monthData.tokens),
        requests: Number(monthData.requests),
        cost: Number(monthData.cost)
      },
      limits: limit ? {
        dailyTokenLimit: limit.dailyTokenLimit,
        monthlyTokenLimit: limit.monthlyTokenLimit,
        dailyCostLimit: limit.dailyCostLimit,
        monthlyCostLimit: limit.monthlyCostLimit
      } : undefined,
      status,
      percentage
    });
  }
  
  return summaries;
}

// ============================================================================
// PROVIDER QUOTAS (Free APIs)
// ============================================================================

export async function getProviderQuotas(tenantId: number): Promise<ProviderQuota[]> {
  const freeProviders = [
    { name: 'groq', dailyLimit: 14400 },
    { name: 'gemini', dailyLimit: 12000 }, // ~12k requests @ 500 tokens/req
    { name: 'huggingface', dailyLimit: 720 },
    { name: 'openrouter', dailyLimit: 50 }
  ];
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const quotas: ProviderQuota[] = [];
  
  for (const provider of freeProviders) {
    const usage = await db
      .select({
        requests: sql<number>`COUNT(*)`
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.tenantId, tenantId),
          eq(tokenUsage.provider, provider.name),
          gte(tokenUsage.timestamp, todayStart)
        )
      );
    
    const used = Number(usage[0].requests);
    const remaining = Math.max(0, provider.dailyLimit - used);
    const percentage = (used / provider.dailyLimit) * 100;
    
    quotas.push({
      provider: provider.name,
      dailyLimit: provider.dailyLimit,
      used,
      remaining,
      percentage,
      resetTime: tomorrow
    });
  }
  
  return quotas;
}

// ============================================================================
// LIMITS AND ALERTS
// ============================================================================

async function checkLimitsAndAlert(tenantId: number, provider: string): Promise<void> {
  const limits = await db
    .select()
    .from(tokenLimits)
    .where(
      and(
        eq(tokenLimits.tenantId, tenantId),
        eq(tokenLimits.provider, provider),
        eq(tokenLimits.alertsEnabled, true)
      )
    )
    .limit(1);
  
  if (limits.length === 0) return;
  
  const limit = limits[0];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Get today's usage
  const usage = await db
    .select({
      tokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
      cost: sql<number>`COALESCE(SUM(${tokenUsage.cost}), 0)`
    })
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.tenantId, tenantId),
        eq(tokenUsage.provider, provider),
        gte(tokenUsage.timestamp, todayStart)
      )
    );
  
  const usageData = usage[0];
  const currentTokens = Number(usageData.tokens);
  const currentCost = Number(usageData.cost);
  
  // Check token limit
  if (limit.dailyTokenLimit && currentTokens >= limit.dailyTokenLimit * limit.alertThreshold) {
    const percentage = currentTokens / limit.dailyTokenLimit;
    const alertType = percentage >= 1.0 ? 'limit_exceeded' : 'threshold_reached';
    
    await createAlert({
      tenantId,
      provider,
      alertType,
      message: `${provider} token usage at ${(percentage * 100).toFixed(1)}% of daily limit`,
      currentUsage: currentTokens,
      limit: limit.dailyTokenLimit,
      percentage
    });
  }
  
  // Check cost limit
  if (limit.dailyCostLimit && currentCost >= limit.dailyCostLimit * limit.alertThreshold) {
    const percentage = currentCost / limit.dailyCostLimit;
    const alertType = percentage >= 1.0 ? 'limit_exceeded' : 'threshold_reached';
    
    await createAlert({
      tenantId,
      provider,
      alertType,
      message: `${provider} cost at ${(percentage * 100).toFixed(1)}% of daily limit ($${currentCost.toFixed(2)})`,
      currentUsage: Math.round(currentCost * 100), // Convert to cents
      limit: Math.round(limit.dailyCostLimit * 100),
      percentage
    });
  }
}

async function createAlert(data: Omit<InsertTokenAlert, 'acknowledged' | 'acknowledgedAt'>): Promise<void> {
  // Check if similar alert exists in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const existing = await db
    .select()
    .from(tokenAlerts)
    .where(
      and(
        eq(tokenAlerts.tenantId, data.tenantId),
        eq(tokenAlerts.provider, data.provider),
        eq(tokenAlerts.alertType, data.alertType),
        gte(tokenAlerts.createdAt, oneHourAgo)
      )
    )
    .limit(1);
  
  if (existing.length > 0) return; // Don't spam alerts
  
  await db.insert(tokenAlerts).values(data);
  
  console.log(`[TOKEN ALERT] ${data.message}`);
}

// ============================================================================
// LIMIT MANAGEMENT
// ============================================================================

export async function setTokenLimit(
  tenantId: number,
  provider: string,
  limits: {
    dailyTokenLimit?: number | null;
    monthlyTokenLimit?: number | null;
    dailyCostLimit?: number | null;
    monthlyCostLimit?: number | null;
    alertThreshold?: number;
    alertEmail?: string;
    alertsEnabled?: boolean;
  }
): Promise<void> {
  const existing = await db
    .select()
    .from(tokenLimits)
    .where(
      and(
        eq(tokenLimits.tenantId, tenantId),
        eq(tokenLimits.provider, provider)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    // Update existing
    await db
      .update(tokenLimits)
      .set({
        ...limits,
        updatedAt: sql`NOW()`
      })
      .where(eq(tokenLimits.id, existing[0].id));
  } else {
    // Create new
    await db.insert(tokenLimits).values({
      tenantId,
      provider,
      ...limits
    });
  }
}

// ============================================================================
// ALERT MANAGEMENT
// ============================================================================

export async function getUnacknowledgedAlerts(tenantId: number): Promise<typeof tokenAlerts.$inferSelect[]> {
  return await db
    .select()
    .from(tokenAlerts)
    .where(
      and(
        eq(tokenAlerts.tenantId, tenantId),
        eq(tokenAlerts.acknowledged, false)
      )
    )
    .orderBy(desc(tokenAlerts.createdAt))
    .limit(50);
}

export async function acknowledgeAlert(alertId: number): Promise<void> {
  await db
    .update(tokenAlerts)
    .set({
      acknowledged: true,
      acknowledgedAt: sql`NOW()`
    })
    .where(eq(tokenAlerts.id, alertId));
}

// ============================================================================
// HISTORICAL DATA
// ============================================================================

export interface TokenTrend {
  date: string;
  tokens: number;
  requests: number;
  cost: number;
}

export async function getTokenTrends(
  tenantId: number,
  provider: string | null,
  days: number = 30
): Promise<TokenTrend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const query = provider
    ? db
        .select({
          date: sql<string>`DATE(${tokenUsage.timestamp})`,
          tokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
          requests: sql<number>`COUNT(*)`,
          cost: sql<number>`COALESCE(SUM(${tokenUsage.cost}), 0)`
        })
        .from(tokenUsage)
        .where(
          and(
            eq(tokenUsage.tenantId, tenantId),
            eq(tokenUsage.provider, provider),
            gte(tokenUsage.timestamp, startDate)
          )
        )
        .groupBy(sql`DATE(${tokenUsage.timestamp})`)
        .orderBy(sql`DATE(${tokenUsage.timestamp})`)
    : db
        .select({
          date: sql<string>`DATE(${tokenUsage.timestamp})`,
          tokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
          requests: sql<number>`COUNT(*)`,
          cost: sql<number>`COALESCE(SUM(${tokenUsage.cost}), 0)`
        })
        .from(tokenUsage)
        .where(
          and(
            eq(tokenUsage.tenantId, tenantId),
            gte(tokenUsage.timestamp, startDate)
          )
        )
        .groupBy(sql`DATE(${tokenUsage.timestamp})`)
        .orderBy(sql`DATE(${tokenUsage.timestamp})`);
  
  const results = await query;
  
  return results.map(r => ({
    date: r.date,
    tokens: Number(r.tokens),
    requests: Number(r.requests),
    cost: Number(r.cost)
  }));
}
