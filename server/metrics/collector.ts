/**
 * Metrics Collector - Real-time performance & usage metrics
 * 
 * As per PDFs: Comprehensive observability with:
 * - Latency percentiles (p50/p95/p99)
 * - Throughput (tokens/s, requests/s)
 * - Cache hit rates
 * - Cost tracking (single-tenant mode)
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
  private latencies: number[] = [];
  private requests: number[] = [];
  private tokens: number[] = [];
  private cacheStats = { hits: 0, misses: 0 };
  private errors: number[] = [];

  /**
   * Record request latency
   */
  recordLatency(latencyMs: number) {
    this.latencies.push(latencyMs);
    
    // Keep only last 1000 entries
    if (this.latencies.length > 1000) this.latencies.shift();
  }

  /**
   * Record request
   */
  recordRequest() {
    this.requests.push(Date.now());
    
    // Keep only last 60 seconds
    const cutoff = Date.now() - 60000;
    this.requests = this.requests.filter((t) => t > cutoff);
  }

  /**
   * Record tokens used
   */
  recordTokens(tokens: number) {
    this.tokens.push(tokens);
    
    // Keep only last 1000 entries
    if (this.tokens.length > 1000) this.tokens.shift();
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(hit: boolean) {
    if (hit) {
      this.cacheStats.hits++;
    } else {
      this.cacheStats.misses++;
    }
  }

  /**
   * Record error
   */
  recordError() {
    this.errors.push(Date.now());
    
    // Keep only last 60 seconds
    const cutoff = Date.now() - 60000;
    this.errors = this.errors.filter((t) => t > cutoff);
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricSnapshot {
    return {
      timestamp: new Date(),
      latency: this.calculateLatencyPercentiles(this.latencies),
      throughput: {
        requestsPerSecond: this.requests.length / 60, // Last 60 seconds
        tokensPerSecond: this.tokens.reduce((a, b) => a + b, 0) / 60,
      },
      cache: {
        hitRate: this.cacheStats.hits + this.cacheStats.misses > 0 
          ? this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) 
          : 0,
        hits: this.cacheStats.hits,
        misses: this.cacheStats.misses,
      },
      costs: {
        totalTokens: this.tokens.reduce((a, b) => a + b, 0),
        estimatedCostUSD: this.estimateCost(this.tokens),
      },
      errors: {
        count: this.errors.length,
        rate: this.errors.length / 60, // Errors per second
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
  async persistMetrics() {
    const snapshot = this.getSnapshot();
    
    try {
      await storage.createMetric({
        metricType: "performance",
        value: snapshot.latency.mean,
        unit: "ms",
        operation: "aggregate",
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
  metricsCollector.persistMetrics().catch(console.error);
}, 60000);
