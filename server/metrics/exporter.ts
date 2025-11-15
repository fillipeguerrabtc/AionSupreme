/**
 * Metrics Exporter - Prometheus-compatible metrics endpoint
 * 
 * As per PDFs: Export metrics in Prometheus format for monitoring
 * - Standard metric types (Counter, Gauge, Histogram)
 * - Custom application metrics
 */

import { type Request, type Response } from "express";
import { metricsCollector } from "./collector";
import { storage } from "../storage";

/**
 * Export metrics in Prometheus format
 */
export async function exportPrometheusMetrics(req: Request, res: Response) {
  try {
    const snapshot = metricsCollector.getSnapshot();
    const lines: string[] = [];

    // Latency metrics (Histogram)
    lines.push("# HELP aion_request_latency_seconds Request latency in seconds");
    lines.push("# TYPE aion_request_latency_seconds histogram");
    lines.push(`aion_request_latency_seconds{quantile="0.5"} ${snapshot.latency.p50 / 1000}`);
    lines.push(`aion_request_latency_seconds{quantile="0.95"} ${snapshot.latency.p95 / 1000}`);
    lines.push(`aion_request_latency_seconds{quantile="0.99"} ${snapshot.latency.p99 / 1000}`);
    
    // Throughput metrics (Gauge)
    lines.push("# HELP aion_requests_per_second Current requests per second");
    lines.push("# TYPE aion_requests_per_second gauge");
    lines.push(`aion_requests_per_second ${snapshot.throughput.requestsPerSecond}`);
    
    lines.push("# HELP aion_tokens_per_second Current tokens per second");
    lines.push("# TYPE aion_tokens_per_second gauge");
    lines.push(`aion_tokens_per_second ${snapshot.throughput.tokensPerSecond}`);
    
    // Cache metrics (Counter + Gauge)
    lines.push("# HELP aion_cache_hits_total Total cache hits");
    lines.push("# TYPE aion_cache_hits_total counter");
    lines.push(`aion_cache_hits_total ${snapshot.cache.hits}`);
    
    lines.push("# HELP aion_cache_misses_total Total cache misses");
    lines.push("# TYPE aion_cache_misses_total counter");
    lines.push(`aion_cache_misses_total ${snapshot.cache.misses}`);
    
    lines.push("# HELP aion_cache_hit_rate Cache hit rate (0-1)");
    lines.push("# TYPE aion_cache_hit_rate gauge");
    lines.push(`aion_cache_hit_rate ${snapshot.cache.hitRate}`);
    
    // Cost metrics (Counter)
    lines.push("# HELP aion_tokens_total Total tokens processed");
    lines.push("# TYPE aion_tokens_total counter");
    lines.push(`aion_tokens_total ${snapshot.costs.totalTokens}`);
    
    lines.push("# HELP aion_estimated_cost_usd Estimated cost in USD");
    lines.push("# TYPE aion_estimated_cost_usd gauge");
    lines.push(`aion_estimated_cost_usd ${snapshot.costs.estimatedCostUSD}`);
    
    // Error metrics (Counter + Gauge)
    lines.push("# HELP aion_errors_total Total errors");
    lines.push("# TYPE aion_errors_total counter");
    lines.push(`aion_errors_total ${snapshot.errors.count}`);
    
    lines.push("# HELP aion_error_rate Errors per second");
    lines.push("# TYPE aion_error_rate gauge");
    lines.push(`aion_error_rate ${snapshot.errors.rate}`);

    res.set("Content-Type", "text/plain; version=0.0.4");
    res.send(lines.join("\n") + "\n");
  } catch (error: any) {
    console.error("[Metrics] Export failed:", error);
    res.status(500).send("# Error exporting metrics\n");
  }
}

/**
 * WebSocket metrics streaming (real-time dashboard)
 */
export function setupMetricsWebSocket(wss: any) {
  wss.on("connection", (ws: any, req: any) => {
    console.log("[Metrics] WebSocket client connected");
    
    // Send metrics every 2 seconds
    const interval = setInterval(() => {
      try {
        const snapshot = metricsCollector.getSnapshot();
        ws.send(JSON.stringify({
          type: "metrics",
          data: snapshot,
        }));
      } catch (error) {
        console.error("[Metrics] WebSocket send error:", error);
      }
    }, 2000);
    
    ws.on("close", () => {
      clearInterval(interval);
      console.log("[Metrics] WebSocket client disconnected");
    });
    
    ws.on("error", (error: any) => {
      console.error("[Metrics] WebSocket error:", error);
      clearInterval(interval);
    });
  });
}
