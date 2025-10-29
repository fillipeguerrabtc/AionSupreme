/**
 * AION Supreme - Text Embedding Service
 * OpenAI text-embedding-3-small (1536 dimensions, $0.00002/1K tokens)
 */

import OpenAI from 'openai';

// ============================================================================
// CONFIGURATION
// ============================================================================

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

// ============================================================================
// CLIENT
// ============================================================================

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ============================================================================
// SINGLE TEXT EMBEDDING
// ============================================================================

export async function embedText(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot embed empty text');
  }

  const client = getClient();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
        encoding_format: 'float'
      });

      const vector = response.data[0].embedding;

      if (vector.length !== EMBEDDING_DIM) {
        throw new Error(`Unexpected embedding dimension: ${vector.length}, expected ${EMBEDDING_DIM}`);
      }

      return vector;

    } catch (error: any) {
      lastError = error;
      console.error(`[Embedder] Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY * attempt);
      }
    }
  }

  throw new Error(`Failed to embed text after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

// ============================================================================
// BATCH EMBEDDING
// ============================================================================

export async function embedTextBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const client = getClient();
  const BATCH_SIZE = 100;  // OpenAI allows up to 2048, but we'll be conservative
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        encoding_format: 'float'
      });

      const vectors = response.data
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);

      results.push(...vectors);

      console.log(`[Embedder] Batch ${Math.floor(i / BATCH_SIZE) + 1}: embedded ${batch.length} texts`);

    } catch (error: any) {
      console.error(`[Embedder] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      
      // Fallback: Embed one by one
      for (const text of batch) {
        try {
          const vector = await embedText(text);
          results.push(vector);
        } catch (e: any) {
          console.error(`[Embedder] Failed to embed single text:`, e.message);
          // Push zero vector as placeholder
          results.push(new Array(EMBEDDING_DIM).fill(0));
        }
      }
    }
  }

  return results;
}

// ============================================================================
// SIMILARITY
// ============================================================================

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// CACHE (In-Memory LRU) - Optional
// ============================================================================

interface CacheEntry {
  vector: number[];
  timestamp: number;
}

const embeddingCache = new Map<string, CacheEntry>();
const CACHE_SIZE = 1000;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function embedTextCached(text: string): Promise<number[]> {
  const cacheKey = (text || '').substring(0, 500); // Use first 500 chars as key

  // Check cache
  const cached = embeddingCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.vector;
  }

  // Embed
  const vector = await embedText(text);

  // Store in cache (with LRU eviction)
  if (embeddingCache.size >= CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) {
      embeddingCache.delete(firstKey);
    }
  }

  embeddingCache.set(cacheKey, {
    vector,
    timestamp: Date.now()
  });

  return vector;
}
