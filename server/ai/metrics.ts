/**
 * AION Supreme - Advanced Metrics System
 * Implements: nDCG, MRR, CTR, CR, Precision@K, Recall@K
 * Based on information retrieval and RAG evaluation metrics
 */

export interface RetrievalResult {
  itemId: string | number;
  score: number;
  relevant?: boolean;  // Ground truth relevance
  clicked?: boolean;   // User interaction
  converted?: boolean; // User conversion (e.g., used in answer)
}

export interface MetricsResult {
  ndcg: number;           // Normalized Discounted Cumulative Gain
  mrr: number;            // Mean Reciprocal Rank
  precisionAtK: number;   // Precision@K
  recallAtK: number;      // Recall@K
  map: number;            // Mean Average Precision
  ctr?: number;           // Click-Through Rate
  cr?: number;            // Conversion Rate
}

// ============================================================================
// DCG & nDCG
// ============================================================================

/**
 * Discounted Cumulative Gain (DCG)
 * DCG@k = Σ(i=1 to k) rel_i / log₂(i+1)
 */
export function calculateDCG(results: RetrievalResult[], k?: number): number {
  const limit = k ? Math.min(k, results.length) : results.length;
  let dcg = 0;

  for (let i = 0; i < limit; i++) {
    const relevance = results[i].relevant ? 1 : 0;
    const discount = Math.log2(i + 2);  // i+2 because i is 0-indexed
    dcg += relevance / discount;
  }

  return dcg;
}

/**
 * Ideal DCG (maximum possible DCG with perfect ranking)
 */
export function calculateIDCG(results: RetrievalResult[], k?: number): number {
  // Sort by relevance (descending)
  const sorted = [...results].sort((a, b) => {
    const relA = a.relevant ? 1 : 0;
    const relB = b.relevant ? 1 : 0;
    return relB - relA;
  });

  return calculateDCG(sorted, k);
}

/**
 * Normalized Discounted Cumulative Gain (nDCG)
 * nDCG@k = DCG@k / IDCG@k
 * Range: [0, 1], where 1 is perfect ranking
 */
export function calculateNDCG(results: RetrievalResult[], k?: number): number {
  const dcg = calculateDCG(results, k);
  const idcg = calculateIDCG(results, k);

  if (idcg === 0) return 0;

  return dcg / idcg;
}

// ============================================================================
// MRR (Mean Reciprocal Rank)
// ============================================================================

/**
 * Reciprocal Rank - finds first relevant result
 * RR = 1 / rank_of_first_relevant_result
 */
export function calculateRR(results: RetrievalResult[]): number {
  for (let i = 0; i < results.length; i++) {
    if (results[i].relevant) {
      return 1 / (i + 1);
    }
  }
  return 0;  // No relevant results
}

/**
 * Mean Reciprocal Rank (averaged over multiple queries)
 */
export function calculateMRR(queries: RetrievalResult[][]): number {
  if (queries.length === 0) return 0;

  const sum = queries.reduce((acc, results) => acc + calculateRR(results), 0);
  return sum / queries.length;
}

// ============================================================================
// Precision & Recall
// ============================================================================

/**
 * Precision@K = (relevant docs in top K) / K
 */
export function calculatePrecisionAtK(results: RetrievalResult[], k: number): number {
  const limit = Math.min(k, results.length);
  if (limit === 0) return 0;

  const relevantInTopK = results
    .slice(0, limit)
    .filter(r => r.relevant)
    .length;

  return relevantInTopK / limit;
}

/**
 * Recall@K = (relevant docs in top K) / (total relevant docs)
 */
export function calculateRecallAtK(results: RetrievalResult[], k: number): number {
  const totalRelevant = results.filter(r => r.relevant).length;
  if (totalRelevant === 0) return 0;

  const limit = Math.min(k, results.length);
  const relevantInTopK = results
    .slice(0, limit)
    .filter(r => r.relevant)
    .length;

  return relevantInTopK / totalRelevant;
}

// ============================================================================
// Mean Average Precision (MAP)
// ============================================================================

/**
 * Average Precision for a single query
 * AP = (Σ P(k) × rel(k)) / total_relevant
 */
export function calculateAP(results: RetrievalResult[]): number {
  const totalRelevant = results.filter(r => r.relevant).length;
  if (totalRelevant === 0) return 0;

  let sum = 0;
  let relevantCount = 0;

  for (let i = 0; i < results.length; i++) {
    if (results[i].relevant) {
      relevantCount++;
      const precisionAtI = relevantCount / (i + 1);
      sum += precisionAtI;
    }
  }

  return sum / totalRelevant;
}

/**
 * Mean Average Precision (averaged over multiple queries)
 */
export function calculateMAP(queries: RetrievalResult[][]): number {
  if (queries.length === 0) return 0;

  const sum = queries.reduce((acc, results) => acc + calculateAP(results), 0);
  return sum / queries.length;
}

// ============================================================================
// CTR & CR (User Engagement Metrics)
// ============================================================================

/**
 * Click-Through Rate
 * CTR = (number of clicks) / (number of impressions)
 */
export function calculateCTR(results: RetrievalResult[]): number {
  if (results.length === 0) return 0;

  const clicks = results.filter(r => r.clicked).length;
  return clicks / results.length;
}

/**
 * Conversion Rate
 * CR = (number of conversions) / (number of impressions)
 */
export function calculateCR(results: RetrievalResult[]): number {
  if (results.length === 0) return 0;

  const conversions = results.filter(r => r.converted).length;
  return conversions / results.length;
}

// ============================================================================
// COMPREHENSIVE METRICS
// ============================================================================

/**
 * Calculate all metrics at once
 */
export function calculateAllMetrics(
  results: RetrievalResult[],
  k: number = 10
): MetricsResult {
  return {
    ndcg: calculateNDCG(results, k),
    mrr: calculateRR(results),
    precisionAtK: calculatePrecisionAtK(results, k),
    recallAtK: calculateRecallAtK(results, k),
    map: calculateAP(results),
    ctr: calculateCTR(results),
    cr: calculateCR(results)
  };
}

// ============================================================================
// CONFIDENCE INTERVALS (Bootstrap)
// ============================================================================

/**
 * Calculate 95% confidence interval using bootstrap
 */
export function bootstrapConfidenceInterval(
  metricFn: (data: any) => number,
  data: any,
  iterations: number = 1000
): { mean: number; lower: number; upper: number } {
  const scores: number[] = [];

  for (let i = 0; i < iterations; i++) {
    // Resample with replacement
    const sample = [];
    for (let j = 0; j < data.length; j++) {
      const randomIndex = Math.floor(Math.random() * data.length);
      sample.push(data[randomIndex]);
    }

    scores.push(metricFn(sample));
  }

  scores.sort((a, b) => a - b);

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const lower = scores[Math.floor(scores.length * 0.025)];
  const upper = scores[Math.floor(scores.length * 0.975)];

  return { mean, lower, upper };
}

// ============================================================================
// A/B TESTING
// ============================================================================

/**
 * Statistical significance test (Welch's t-test)
 */
export function welchTTest(
  scoresA: number[],
  scoresB: number[]
): { tStat: number; pValue: number; significant: boolean } {
  const n1 = scoresA.length;
  const n2 = scoresB.length;

  if (n1 < 2 || n2 < 2) {
    throw new Error('Need at least 2 samples in each group');
  }

  // Means
  const mean1 = scoresA.reduce((a, b) => a + b, 0) / n1;
  const mean2 = scoresB.reduce((a, b) => a + b, 0) / n2;

  // Variances
  const var1 = scoresA.reduce((sum, x) => sum + (x - mean1) ** 2, 0) / (n1 - 1);
  const var2 = scoresB.reduce((sum, x) => sum + (x - mean2) ** 2, 0) / (n2 - 1);

  // t-statistic
  const tStat = (mean1 - mean2) / Math.sqrt(var1 / n1 + var2 / n2);

  // Degrees of freedom (Welch-Satterthwaite)
  const df = ((var1 / n1 + var2 / n2) ** 2) / (
    (var1 / n1) ** 2 / (n1 - 1) +
    (var2 / n2) ** 2 / (n2 - 1)
  );

  // Approximate p-value (two-tailed)
  const pValue = 2 * (1 - studentTCDF(Math.abs(tStat), df));

  return {
    tStat,
    pValue,
    significant: pValue < 0.05
  };
}

/**
 * Student's t-distribution CDF (approximation)
 */
function studentTCDF(t: number, df: number): number {
  // Approximation using normal distribution for large df
  if (df > 30) {
    return normalCDF(t);
  }

  // For small df, use Hill's algorithm (approximation)
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;

  return 1 - 0.5 * incompleteBeta(x, a, b);
}

function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function erf(x: number): number {
  // Abramowitz and Stegun approximation
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

function incompleteBeta(x: number, a: number, b: number): number {
  // Simplified approximation
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Use logarithmic approximation
  const logBeta = Math.log(gamma(a) * gamma(b) / gamma(a + b));
  const factor = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - logBeta);

  return factor * continuedFraction(x, a, b);
}

function gamma(n: number): number {
  // Stirling's approximation
  if (n === 0.5) return Math.sqrt(Math.PI);
  if (n === 1) return 1;

  return Math.sqrt(2 * Math.PI / n) * Math.pow(n / Math.E, n);
}

function continuedFraction(x: number, a: number, b: number): number {
  const maxIter = 100;
  const epsilon = 1e-10;

  let result = 1;
  for (let i = 1; i <= maxIter; i++) {
    const term = (i * (b - i) * x) / ((a + 2 * i - 1) * (a + 2 * i));
    result *= (1 + term);

    if (Math.abs(term) < epsilon) break;
  }

  return result / a;
}
