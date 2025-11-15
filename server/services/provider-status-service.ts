/**
 * Provider Status Service
 * 
 * Centralized service for provider quota/health monitoring.
 * Replaces FreeLLMProviders status methods after LLM Gateway migration.
 * 
 * DEFENSIVE PROGRAMMING:
 * - Handles null/undefined from apiQuotaRepository.getStatus() (empty DB case)
 * - Falls back to safe defaults (zero quotas) to prevent TypeErrors
 * - Uninitialized providers marked as "exhausted" in health checks
 */

import { apiQuotaRepository } from "../repositories/api-quota-repository";

/**
 * Default quota values when provider not initialized in DB
 * Prevents crashes when apiQuotaRepository returns null/undefined
 */
const DEFAULT_PROVIDER_QUOTAS = {
  groq: { dailyLimit: 0, used: 0 },
  gemini: { dailyLimit: 0, used: 0 },
  openrouter: { dailyLimit: 0, used: 0 },
};

export interface ProviderQuotaStatus {
  remaining: number;
  limit: number;
  used: number;
}

export interface ProviderStatus {
  groq: ProviderQuotaStatus;
  gemini: ProviderQuotaStatus;
  openrouter: ProviderQuotaStatus;
}

export interface ProviderHealthStatus {
  status: "healthy" | "exhausted";
}

export interface ProviderHealth {
  groq: ProviderHealthStatus;
  gemini: ProviderHealthStatus;
  openrouter: ProviderHealthStatus;
}

/**
 * Get quota status for all providers
 * 
 * DEFENSIVE DEFAULTS: Falls back to zero values if provider not initialized in DB
 * This prevents TypeError when apiQuotaRepository returns null/undefined for unused providers
 * 
 * TOP-LEVEL PROTECTION: Handles case where entire getStatus() returns null (empty DB)
 */
export async function getProviderStatus(): Promise<ProviderStatus> {
  const dbStatus = (await apiQuotaRepository.getStatus()) ?? DEFAULT_PROVIDER_QUOTAS;
  
  return {
    groq: {
      remaining: (dbStatus.groq?.dailyLimit ?? 0) - (dbStatus.groq?.used ?? 0),
      limit: dbStatus.groq?.dailyLimit ?? 0,
      used: dbStatus.groq?.used ?? 0,
    },
    gemini: {
      remaining: (dbStatus.gemini?.dailyLimit ?? 0) - (dbStatus.gemini?.used ?? 0),
      limit: dbStatus.gemini?.dailyLimit ?? 0,
      used: dbStatus.gemini?.used ?? 0,
    },
    openrouter: {
      remaining: (dbStatus.openrouter?.dailyLimit ?? 0) - (dbStatus.openrouter?.used ?? 0),
      limit: dbStatus.openrouter?.dailyLimit ?? 0,
      used: dbStatus.openrouter?.used ?? 0,
    },
  };
}

/**
 * Get health status for all providers
 * 
 * DEFENSIVE LOGIC: Treats uninitialized providers as "exhausted" (safe default)
 * If dailyLimit or used is null/undefined, provider is marked exhausted
 * 
 * TOP-LEVEL PROTECTION: Handles case where entire getStatus() returns null (empty DB)
 */
export async function getProviderHealth(): Promise<ProviderHealth> {
  const dbStatus = (await apiQuotaRepository.getStatus()) ?? DEFAULT_PROVIDER_QUOTAS;
  
  return {
    groq: {
      status: (dbStatus.groq?.used ?? Infinity) < (dbStatus.groq?.dailyLimit ?? 0) ? "healthy" : "exhausted",
    },
    gemini: {
      status: (dbStatus.gemini?.used ?? Infinity) < (dbStatus.gemini?.dailyLimit ?? 0) ? "healthy" : "exhausted",
    },
    openrouter: {
      status: (dbStatus.openrouter?.used ?? Infinity) < (dbStatus.openrouter?.dailyLimit ?? 0) ? "healthy" : "exhausted",
    },
  };
}
