/**
 * AION Supreme - Token Usage Tracking Service
 * Real-time monitoring of token consumption across all APIs
 * 
 * DATA RETENTION POLICY:
 * - Historical data retention: 5 YEARS (1,825 days)
 * - All token usage, web searches, KB searches are preserved for 5 years
 * - Automatic cleanup runs monthly to remove data older than 5 years
 * - This ensures comprehensive analytics while maintaining database performance
 */

import { db } from '../db';
import { tokenUsage, tokenLimits, tokenAlerts, type InsertTokenUsage, type InsertTokenAlert } from '@shared/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

// ============================================================================
// TIMEZONE HELPERS (Brasília/São Paulo)
// ============================================================================

/**
 * Get the start of today in local timezone (Brasília)
 * This ensures "today" matches the user's local time, not UTC
 */
function getLocalDayStart(date: Date = new Date()): Date {
  const localDate = new Date(date);
  localDate.setHours(0, 0, 0, 0);
  return localDate;
}

/**
 * Get the start of current month in local timezone (Brasília)
 */
function getLocalMonthStart(date: Date = new Date()): Date {
  const localDate = new Date(date);
  localDate.setDate(1);
  localDate.setHours(0, 0, 0, 0);
  return localDate;
}

// ============================================================================
// TYPES
// ============================================================================

export interface WebSearchMetadata {
  query: string;
  sources: Array<{
    url: string;
    title: string;
    snippet?: string;
    domain?: string;
  }>;
  resultsCount: number;
  indexedDocuments?: number;
}

export interface TokenTrackingData {
  provider: 'groq' | 'gemini' | 'huggingface' | 'openrouter' | 'openai' | 'kb' | 'web' | 'deepweb';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  requestType: 'chat' | 'embedding' | 'transcription' | 'image' | 'search';
  success: boolean;
  metadata?: WebSearchMetadata;
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
  allTime: {
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
  
  // Insert usage record (tenantId defaults to 1 in schema)
  await db.insert(tokenUsage).values({
    provider: data.provider,
    model: data.model,
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    totalTokens: data.totalTokens,
    cost,
    requestType: data.requestType,
    success: data.success,
    metadata: data.metadata as any
  });
  
  // Check limits and send alerts if necessary
  await checkLimitsAndAlert(data.provider);
}

// ============================================================================
// USAGE SUMMARY
// ============================================================================

export async function getUsageSummary(): Promise<UsageSummary[]> {
  const providers = ['groq', 'gemini', 'huggingface', 'openrouter', 'openai', 'kb', 'web', 'deepweb'];
  const now = new Date();
  
  // Use local timezone (Brasília) for "today" and "this month" calculations
  const todayStart = getLocalDayStart(now);
  const monthStart = getLocalMonthStart(now);
  
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
          eq(tokenUsage.provider, provider),
          gte(tokenUsage.timestamp, monthStart)
        )
      );
    
    // Get all-time usage (cumulative)
    const allTimeUsage = await db
      .select({
        tokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
        requests: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${tokenUsage.cost}), 0)`
      })
      .from(tokenUsage)
      .where(eq(tokenUsage.provider, provider));
    
    // Get limits
    const limits = await db
      .select()
      .from(tokenLimits)
      .where(eq(tokenLimits.provider, provider))
      .limit(1);
    
    const limit = limits[0];
    const todayData = todayUsage[0];
    const monthData = monthUsage[0];
    const allTimeData = allTimeUsage[0];
    
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
      allTime: {
        tokens: Number(allTimeData.tokens),
        requests: Number(allTimeData.requests),
        cost: Number(allTimeData.cost)
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

export async function getProviderQuotas(): Promise<ProviderQuota[]> {
  const freeProviders = [
    { name: 'groq', dailyLimit: 14400 },
    { name: 'gemini', dailyLimit: 12000 }, // ~12k requests @ 500 tokens/req
    { name: 'huggingface', dailyLimit: 720 },
    { name: 'openrouter', dailyLimit: 50 }
  ];
  
  const now = new Date();
  
  // Use local timezone (Brasília) for daily reset calculation
  const todayStart = getLocalDayStart(now);
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

async function checkLimitsAndAlert(provider: string): Promise<void> {
  const limits = await db
    .select()
    .from(tokenLimits)
    .where(
      and(
        eq(tokenLimits.provider, provider),
        eq(tokenLimits.alertsEnabled, true)
      )
    )
    .limit(1);
  
  if (limits.length === 0) return;
  
  const limit = limits[0];
  const now = new Date();
  
  // Use local timezone (Brasília) for alert calculations
  const todayStart = getLocalDayStart(now);
  
  // Get today's usage
  const usage = await db
    .select({
      tokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
      cost: sql<number>`COALESCE(SUM(${tokenUsage.cost}), 0)`
    })
    .from(tokenUsage)
    .where(
      and(
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
      provider,
      alertType,
      message: `${provider} cost at ${(percentage * 100).toFixed(1)}% of daily limit ($${currentCost.toFixed(2)})`,
      currentUsage: Math.round(currentCost * 100), // Convert to cents
      limit: Math.round(limit.dailyCostLimit * 100),
      percentage
    });
  }
}

async function createAlert(data: Omit<InsertTokenAlert, 'tenantId' | 'acknowledged' | 'acknowledgedAt'>): Promise<void> {
  // Check if similar alert exists in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const existing = await db
    .select()
    .from(tokenAlerts)
    .where(
      and(
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
    .where(eq(tokenLimits.provider, provider))
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
    // Create new (tenantId defaults to 1 in schema)
    await db.insert(tokenLimits).values({
      provider,
      ...limits
    });
  }
}

// ============================================================================
// ALERT MANAGEMENT
// ============================================================================

export async function getUnacknowledgedAlerts(): Promise<typeof tokenAlerts.$inferSelect[]> {
  return await db
    .select()
    .from(tokenAlerts)
    .where(eq(tokenAlerts.acknowledged, false))
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
  provider: string | null,
  days: number = 30,
  startDateOverride?: Date,
  endDateOverride?: Date
): Promise<TokenTrend[]> {
  const endDate = endDateOverride || new Date();
  const startDate = startDateOverride || new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  
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
            eq(tokenUsage.provider, provider),
            gte(tokenUsage.timestamp, startDate),
            sql`DATE(${tokenUsage.timestamp}) <= DATE(${endDate.toISOString()})`
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
            gte(tokenUsage.timestamp, startDate),
            sql`DATE(${tokenUsage.timestamp}) <= DATE(${endDate.toISOString()})`
          )
        )
        .groupBy(sql`DATE(${tokenUsage.timestamp})`)
        .orderBy(sql`DATE(${tokenUsage.timestamp})`);
  
  const results = await query;
  
  // Fill missing dates with zero values for complete timeline
  const filledResults: TokenTrend[] = [];
  const resultMap = new Map(results.map(r => [r.date, r]));
  
  const currentDate = new Date(startDate);
  const finalDate = new Date(endDate);
  
  while (currentDate <= finalDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const existing = resultMap.get(dateStr);
    
    filledResults.push({
      date: dateStr,
      tokens: existing ? Number(existing.tokens) : 0,
      requests: existing ? Number(existing.requests) : 0,
      cost: existing ? Number(existing.cost) : 0
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return filledResults;
}

// Get token trends with breakdown by provider (including KB, Web, DeepWeb)
export interface TokenTrendByProvider {
  date: string;
  totalTokens: number;
  groq?: number;
  gemini?: number;
  huggingface?: number;
  openrouter?: number;
  openai?: number;
  kb?: number;
  web?: number;
  deepweb?: number;
  [key: string]: number | string | undefined;
}

export async function getTokenTrendsWithProviders(
  days: number = 30,
  startDateOverride?: Date,
  endDateOverride?: Date
): Promise<TokenTrendByProvider[]> {
  const endDate = endDateOverride || new Date();
  const startDate = startDateOverride || new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  
  // Get all token usage grouped by date and provider
  const results = await db
    .select({
      date: sql<string>`DATE(${tokenUsage.timestamp})`,
      provider: tokenUsage.provider,
      tokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
      requests: sql<number>`COUNT(*)`
    })
    .from(tokenUsage)
    .where(
      and(
        gte(tokenUsage.timestamp, startDate),
        sql`DATE(${tokenUsage.timestamp}) <= DATE(${endDate.toISOString()})`
      )
    )
    .groupBy(sql`DATE(${tokenUsage.timestamp})`, tokenUsage.provider)
    .orderBy(sql`DATE(${tokenUsage.timestamp})`);
  
  // Group by date and aggregate providers
  const grouped = new Map<string, TokenTrendByProvider>();
  
  results.forEach(r => {
    const dateStr = r.date;
    if (!grouped.has(dateStr)) {
      grouped.set(dateStr, {
        date: dateStr,
        totalTokens: 0,
        groq: 0,
        gemini: 0,
        huggingface: 0,
        openrouter: 0,
        openai: 0,
        kb: 0,
        web: 0,
        deepweb: 0
      });
    }
    
    const entry = grouped.get(dateStr)!;
    const providerKey = r.provider || 'unknown';
    entry[providerKey] = Number(r.tokens);
    entry.totalTokens += Number(r.tokens);
  });
  
  // Fill missing dates with zero values for complete timeline
  const filledResults: TokenTrendByProvider[] = [];
  const currentDate = new Date(startDate);
  const finalDate = new Date(endDate);
  
  while (currentDate <= finalDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const existing = grouped.get(dateStr);
    
    filledResults.push(existing || {
      date: dateStr,
      totalTokens: 0,
      groq: 0,
      gemini: 0,
      huggingface: 0,
      openrouter: 0,
      openai: 0,
      kb: 0,
      web: 0,
      deepweb: 0
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return filledResults;
}

// ============================================================================
// WEB/DEEPWEB SEARCH HISTORY
// ============================================================================

export interface SearchHistoryEntry {
  id: number;
  provider: 'web' | 'deepweb';
  query: string;
  sources: Array<{
    url: string;
    title: string;
    snippet?: string;
    domain?: string;
  }>;
  resultsCount: number;
  indexedDocuments?: number;
  timestamp: Date;
  success: boolean;
}

export async function getWebSearchHistory(
  provider: 'web' | 'deepweb' | 'both' = 'both',
  limit: number = 100
): Promise<SearchHistoryEntry[]> {
  const query = provider === 'both'
    ? db
        .select()
        .from(tokenUsage)
        .where(
          and(
            sql`${tokenUsage.provider} IN ('web', 'deepweb')`,
            eq(tokenUsage.requestType, 'search')
          )
        )
        .orderBy(desc(tokenUsage.timestamp))
        .limit(limit)
    : db
        .select()
        .from(tokenUsage)
        .where(
          and(
            eq(tokenUsage.provider, provider),
            eq(tokenUsage.requestType, 'search')
          )
        )
        .orderBy(desc(tokenUsage.timestamp))
        .limit(limit);
  
  const results = await query;
  
  return results.map(r => ({
    id: r.id,
    provider: r.provider as 'web' | 'deepweb',
    query: (r.metadata as any)?.query || '',
    sources: (r.metadata as any)?.sources || [],
    resultsCount: (r.metadata as any)?.resultsCount || 0,
    indexedDocuments: (r.metadata as any)?.indexedDocuments,
    timestamp: r.timestamp,
    success: r.success
  }));
}

export async function getWebSearchStats(): Promise<{
  web: {
    totalSearches: number;
    successfulSearches: number;
    totalSources: number;
    uniqueDomains: number;
  };
  deepweb: {
    totalSearches: number;
    successfulSearches: number;
    totalSources: number;
    uniqueDomains: number;
  };
}> {
  const webStats = await db
    .select({
      total: sql<number>`COUNT(*)`,
      successful: sql<number>`SUM(CASE WHEN ${tokenUsage.success} = true THEN 1 ELSE 0 END)`,
    })
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.provider, 'web'),
        eq(tokenUsage.requestType, 'search')
      )
    );
  
  const deepwebStats = await db
    .select({
      total: sql<number>`COUNT(*)`,
      successful: sql<number>`SUM(CASE WHEN ${tokenUsage.success} = true THEN 1 ELSE 0 END)`,
    })
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.provider, 'deepweb'),
        eq(tokenUsage.requestType, 'search')
      )
    );
  
  // Get all web searches to count sources/domains
  const webSearches = await db
    .select()
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.provider, 'web'),
        eq(tokenUsage.requestType, 'search'),
        eq(tokenUsage.success, true)
      )
    );
  
  const deepwebSearches = await db
    .select()
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.provider, 'deepweb'),
        eq(tokenUsage.requestType, 'search'),
        eq(tokenUsage.success, true)
      )
    );
  
  // Count total sources and unique domains
  let webTotalSources = 0;
  const webDomains = new Set<string>();
  
  for (const search of webSearches) {
    const sources = (search.metadata as any)?.sources || [];
    webTotalSources += sources.length;
    sources.forEach((s: any) => {
      if (s.domain) webDomains.add(s.domain);
    });
  }
  
  let deepwebTotalSources = 0;
  const deepwebDomains = new Set<string>();
  
  for (const search of deepwebSearches) {
    const sources = (search.metadata as any)?.sources || [];
    deepwebTotalSources += sources.length;
    sources.forEach((s: any) => {
      if (s.domain) deepwebDomains.add(s.domain);
    });
  }
  
  return {
    web: {
      totalSearches: Number(webStats[0]?.total || 0),
      successfulSearches: Number(webStats[0]?.successful || 0),
      totalSources: webTotalSources,
      uniqueDomains: webDomains.size
    },
    deepweb: {
      totalSearches: Number(deepwebStats[0]?.total || 0),
      successfulSearches: Number(deepwebStats[0]?.successful || 0),
      totalSources: deepwebTotalSources,
      uniqueDomains: deepwebDomains.size
    }
  };
}

// ============================================================================
// KNOWLEDGE BASE SEARCH HISTORY
// ============================================================================

export interface KBSearchHistoryEntry {
  id: number;
  query: string;
  resultsCount: number;
  confidence?: number;
  success: boolean;
  timestamp: Date;
}

export async function getKBSearchHistory(
  limit: number = 100
): Promise<KBSearchHistoryEntry[]> {
  const results = await db
    .select()
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.provider, 'kb'),
        eq(tokenUsage.requestType, 'chat')
      )
    )
    .orderBy(desc(tokenUsage.timestamp))
    .limit(limit);
  
  return results.map(r => ({
    id: r.id,
    query: (r.metadata as any)?.query || '',
    resultsCount: (r.metadata as any)?.resultsCount || 0,
    confidence: (r.metadata as any)?.confidence,
    success: r.success,
    timestamp: r.timestamp
  }));
}

// ============================================================================
// FREE APIs USAGE HISTORY
// ============================================================================

export interface FreeAPIHistoryEntry {
  id: number;
  provider: 'groq' | 'gemini' | 'huggingface' | 'openrouter';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  success: boolean;
  timestamp: Date;
}

export async function getFreeAPIsHistory(
  provider?: 'groq' | 'gemini' | 'huggingface' | 'openrouter',
  limit: number = 100
): Promise<FreeAPIHistoryEntry[]> {
  const query = provider
    ? db
        .select()
        .from(tokenUsage)
        .where(
          and(
            eq(tokenUsage.provider, provider),
            eq(tokenUsage.requestType, 'chat')
          )
        )
        .orderBy(desc(tokenUsage.timestamp))
        .limit(limit)
    : db
        .select()
        .from(tokenUsage)
        .where(
          and(
            sql`${tokenUsage.provider} IN ('groq', 'gemini', 'huggingface', 'openrouter')`,
            eq(tokenUsage.requestType, 'chat')
          )
        )
        .orderBy(desc(tokenUsage.timestamp))
        .limit(limit);
  
  const results = await query;
  
  return results.map(r => ({
    id: r.id,
    provider: r.provider as 'groq' | 'gemini' | 'huggingface' | 'openrouter',
    model: r.model,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalTokens: r.totalTokens,
    success: r.success,
    timestamp: r.timestamp
  }));
}

// ============================================================================
// COMPLETE HISTORY - All APIs combined
// ============================================================================

export async function getCompleteTokenHistory(
  limit: number = 500
): Promise<any[]> {
  const records = await db
    .select({
      id: tokenUsage.id,
      provider: tokenUsage.provider,
      model: tokenUsage.model,
      promptTokens: tokenUsage.promptTokens,
      completionTokens: tokenUsage.completionTokens,
      totalTokens: tokenUsage.totalTokens,
      cost: tokenUsage.cost,
      requestType: tokenUsage.requestType,
      success: tokenUsage.success,
      timestamp: tokenUsage.timestamp,
      metadata: tokenUsage.metadata
    })
    .from(tokenUsage)
    .orderBy(desc(tokenUsage.timestamp))
    .limit(limit);
  
  return records;
}

export async function getCostHistory(
  limit: number = 500
): Promise<any> {
  // Get all records with costs
  const records = await db
    .select({
      id: tokenUsage.id,
      provider: tokenUsage.provider,
      model: tokenUsage.model,
      promptTokens: tokenUsage.promptTokens,
      completionTokens: tokenUsage.completionTokens,
      totalTokens: tokenUsage.totalTokens,
      cost: tokenUsage.cost,
      timestamp: tokenUsage.timestamp
    })
    .from(tokenUsage)
    .where(sql`${tokenUsage.cost} > 0`)
    .orderBy(desc(tokenUsage.timestamp))
    .limit(limit);
  
  // Calculate total costs by provider
  const providerTotals = await db
    .select({
      provider: tokenUsage.provider,
      totalCost: sql<number>`COALESCE(SUM(${tokenUsage.cost}), 0)`,
      totalRequests: sql<number>`COUNT(*)`
    })
    .from(tokenUsage)
    .where(sql`${tokenUsage.cost} > 0`)
    .groupBy(tokenUsage.provider);
  
  return {
    records,
    totals: providerTotals,
    overallTotal: providerTotals.reduce((sum, p) => sum + Number(p.totalCost), 0)
  };
}

// ============================================================================
// DATA RETENTION & CLEANUP (5 YEARS)
// ============================================================================

/**
 * Check if cleanup is needed (if there's old data to delete)
 * Checks BOTH tokenUsage and tokenAlerts tables
 * @returns true if there's data older than 5 years in either table, false otherwise
 */
export async function needsCleanup(): Promise<boolean> {
  const RETENTION_DAYS = 1825;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  
  // Check tokenUsage table
  const usageCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tokenUsage)
    .where(lte(tokenUsage.timestamp, cutoffDate));
  
  if (Number(usageCount[0]?.count ?? 0) > 0) {
    return true;
  }
  
  // Check tokenAlerts table
  const alertsCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tokenAlerts)
    .where(lte(tokenAlerts.createdAt, cutoffDate));
  
  return Number(alertsCount[0]?.count ?? 0) > 0;
}

/**
 * Cleanup old token usage data older than 5 years (1,825 days)
 * This function should be called periodically (monthly recommended)
 * to maintain database performance while preserving historical analytics
 * 
 * RETENTION POLICY:
 * - All data < 5 years old: PRESERVED
 * - All data >= 5 years old: DELETED
 * - Applies to: tokenUsage, tokenAlerts
 * 
 * @param skipCheck - Skip the needsCleanup check (for forced cleanup)
 * @returns Number of records deleted, or null if no cleanup was needed
 */
export async function cleanupOldTokenData(
  skipCheck: boolean = false
): Promise<{
  tokenUsageDeleted: number;
  alertsDeleted: number;
} | null> {
  const RETENTION_DAYS = 1825; // 5 years = 1,825 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  
  // Check if cleanup is needed
  if (!skipCheck) {
    const needed = await needsCleanup();
    if (!needed) {
      console.log(`[Token Cleanup] No data older than ${cutoffDate.toISOString()} found - skipping cleanup`);
      return null;
    }
  }
  
  console.log(`[Token Cleanup] Starting cleanup for data older than ${cutoffDate.toISOString()} (5 years)`);
  
  // Delete old token usage records
  const tokenUsageDeleted = await db
    .delete(tokenUsage)
    .where(lte(tokenUsage.timestamp, cutoffDate));
  
  // Delete old alerts
  const alertsDeleted = await db
    .delete(tokenAlerts)
    .where(lte(tokenAlerts.createdAt, cutoffDate));
  
  const result = {
    tokenUsageDeleted: Array.isArray(tokenUsageDeleted) ? tokenUsageDeleted.length : 0,
    alertsDeleted: Array.isArray(alertsDeleted) ? alertsDeleted.length : 0
  };
  
  console.log(`[Token Cleanup] Completed: ${result.tokenUsageDeleted} token records, ${result.alertsDeleted} alerts deleted`);
  
  return result;
}

/**
 * Get data retention statistics
 * Shows how much historical data is stored and oldest record date
 */
export async function getRetentionStats(): Promise<{
  totalRecords: number;
  oldestRecord: Date | null;
  newestRecord: Date | null;
  retentionDays: number;
  dataSize: string;
}> {
  const stats = await db
    .select({
      count: sql<number>`COUNT(*)`,
      oldest: sql<Date>`MIN(${tokenUsage.timestamp})`,
      newest: sql<Date>`MAX(${tokenUsage.timestamp})`
    })
    .from(tokenUsage);
  
  const stat = stats[0];
  const totalRecords = Number(stat.count);
  const oldestRecord = stat.oldest ? new Date(stat.oldest) : null;
  const newestRecord = stat.newest ? new Date(stat.newest) : null;
  
  const retentionDays = oldestRecord && newestRecord
    ? Math.floor((newestRecord.getTime() - oldestRecord.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  
  // Estimate data size (rough approximation: ~500 bytes per record)
  const estimatedBytes = totalRecords * 500;
  const dataSize = estimatedBytes < 1024 * 1024
    ? `${(estimatedBytes / 1024).toFixed(2)} KB`
    : `${(estimatedBytes / (1024 * 1024)).toFixed(2)} MB`;
  
  return {
    totalRecords,
    oldestRecord,
    newestRecord,
    retentionDays,
    dataSize
  };
}
