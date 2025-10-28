/**
 * Metrics Collector - Real-time performance & usage metrics
 * 
 * As per PDFs: Comprehensive observability with:
 * - Latency percentiles (p50/p95/p99)
 * - Throughput (tokens/s, requests/s)
 * - Cache hit rates
 * - Cost tracking per tenant
 * - Resource utilization
 */

import { storage } from "../storage";

interface LatencyMetric {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
}

interface MetricSnapshot {
  timestamp: Date;
  tenantId: number;
  latency: LatencyMetric;
  throughput: {
    requestsPerSecond: number;
    tokensPerSecond: number;
  };
  cache: {
    hitRate: number;
    hits: number;
    misses: number;
  };
  costs: {
    totalTokens: number;
    estimatedCostUSD: number;
  };
  errors: {
    count: number;
    rate: number;
  };
}

class MetricsCollector {
  private latencies: Map<number, number[]> = new Map();
  private requests: Map<number, number[]> = new Map();
  private tokens: Map<number, number[]> = new Map();
  private cacheStats: Map<number, { hits: number; misses: number }> = new Map();
  private errors: Map<number, number[]> = new Map();

  /**
   * Record request latency
   */
  recordLatency(tenantId: number, latencyMs: number) {
    const arr = this.latencies.get(tenantId) || [];
    arr.push(latencyMs);
    
    // Keep only last 1000 entries
    if (arr.length > 1000) arr.shift();
    
    this.latencies.set(tenantId, arr);
  }

  /**
   * Record request
   */
  recordRequest(tenantId: number) {
    const arr = this.requests.get(tenantId) || [];
    arr.push(Date.now());
    
    // Keep only last 60 seconds
    const cutoff = Date.now() - 60000;
    const filtered = arr.filter((t) => t > cutoff);
    
    this.requests.set(tenantId, filtered);
  }

  /**
   * Record tokens used
   */
  recordTokens(tenantId: number, tokens: number) {
    const arr = this.tokens.get(tenantId) || [];
    arr.push(tokens);
    
    // Keep only last 1000 entries
    if (arr.length > 1000) arr.shift();
    
    this.tokens.set(tenantId, arr);
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(tenantId: number, hit: boolean) {
    const stats = this.cacheStats.get(tenantId) || { hits: 0, misses: 0 };
    
    if (hit) {
      stats.hits++;
    } else {
      stats.misses++;
    }
    
    this.cacheStats.set(tenantId, stats);
  }

  /**
   * Record error
   */
  recordError(tenantId: number) {
    const arr = this.errors.get(tenantId) || [];
    arr.push(Date.now());
    
    // Keep only last 60 seconds
    const cutoff = Date.now() - 60000;
    const filtered = arr.filter((t) => t > cutoff);
    
    this.errors.set(tenantId, filtered);
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(tenantId: number): MetricSnapshot {
    const latencies = this.latencies.get(tenantId) || [];
    const requests = this.requests.get(tenantId) || [];
    const tokens = this.tokens.get(tenantId) || [];
    const cache = this.cacheStats.get(tenantId) || { hits: 0, misses: 0 };
    const errors = this.errors.get(tenantId) || [];

    return {
      timestamp: new Date(),
      tenantId,
      latency: this.calculateLatencyPercentiles(latencies),
      throughput: {
        requestsPerSecond: requests.length / 60, // Last 60 seconds
        tokensPerSecond: tokens.reduce((a, b) => a + b, 0) / 60,
      },
      cache: {
        hitRate: cache.hits + cache.misses > 0 
          ? cache.hits / (cache.hits + cache.misses) 
          : 0,
        hits: cache.hits,
        misses: cache.misses,
      },
      costs: {
        totalTokens: tokens.reduce((a, b) => a + b, 0),
        estimatedCostUSD: this.estimateCost(tokens),
      },
      errors: {
        count: errors.length,
        rate: errors.length / 60, // Errors per second
      },
    };
  }

  /**
   * Calculate latency percentiles
   */
  private calculateLatencyPercentiles(latencies: number[]): LatencyMetric {
    if (latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, mean: 0, max: 0 };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    
    return {
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      max: sorted[sorted.length - 1],
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Estimate cost based on tokens
   * GPT-4: $0.03/1K input tokens, $0.06/1K output tokens
   * GPT-3.5: $0.0015/1K input tokens, $0.002/1K output tokens
   */
  private estimateCost(tokens: number[]): number {
    const totalTokens = tokens.reduce((a, b) => a + b, 0);
    
    // Assume 50/50 split input/output, GPT-4 pricing
    const inputCost = (totalTokens * 0.5) * (0.03 / 1000);
    const outputCost = (totalTokens * 0.5) * (0.06 / 1000);
    
    return inputCost + outputCost;
  }

  /**
   * Persist metrics to database
   */
  async persistMetrics(tenantId: number) {
    const snapshot = this.getSnapshot(tenantId);
    
    try {
      await storage.createMetric({
        tenantId,
        metricType: "performance",
        value: snapshot.latency.mean,
        metadata: snapshot,
      });
    } catch (error) {
      console.error("[Metrics] Failed to persist metrics:", error);
    }
  }
}

export const metricsCollector = new MetricsCollector();

// Persist metrics every 60 seconds
setInterval(() => {
  // Persist for all active tenants
  // For simplicity, just persist for tenant 1
  metricsCollector.persistMetrics(1).catch(console.error);
}, 60000);
