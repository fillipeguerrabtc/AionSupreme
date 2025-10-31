/**
 * AION Supreme - RAG (Retrieval-Augmented Generation) Service
 * Implements: MMR (Maximal Marginal Relevance), BM25, Hybrid Search, Confidence Scoring
 */

import { db } from '../db';
import { documents, embeddings } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { embedText, cosineSimilarity } from './embedder';
import { storage } from '../storage';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchResult {
  documentId: number;
  chunkId: number;
  chunkText: string;
  score: number;
  metadata?: {
    title?: string;
    source?: string;
    url?: string;
    images?: string[];  // URLs de imagens aprovadas
  };
  attachments?: Array<{  // Attachments multimodais
    type: "image" | "video" | "document";
    url: string;
    filename: string;
    mimeType: string;
    size?: number;
  }>;
}

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  lambda?: number;  // MMR diversity parameter (0 = max diversity, 1 = max relevance)
  includeMetadata?: boolean;
}

export interface ConfidenceResult {
  confidence: number;  // 0-1
  threshold: number;
  shouldFallback: boolean;
  topResults: SearchResult[];
}

// ============================================================================
// SEMANTIC SEARCH
// ============================================================================

export async function semanticSearch(
  query: string,
  tenantId: number,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    limit = 10,
    minScore = 0.5,
    includeMetadata = true
  } = options;

  // Step 1: Embed query
  console.log('[RAG] Embedding query...');
  const queryVector = await embedText(query);

  // Step 2: Retrieve ONLY embeddings from APPROVED documents (status='indexed')
  // HITL FIX: Use storage.getEmbeddingsByTenant which filters by document status
  console.log('[RAG] Retrieving embeddings from APPROVED documents only...');
  const allEmbeddings = await storage.getEmbeddingsByTenant(tenantId, 10000);

  if (allEmbeddings.length === 0) {
    console.log('[RAG] ⚠️  No APPROVED embeddings found (all content in curation queue)');
    return [];
  }
  
  console.log(`[RAG] ✅ Found ${allEmbeddings.length} embeddings from approved documents`);

  // Step 3: Calculate similarities
  console.log(`[RAG] Calculating similarities for ${allEmbeddings.length} chunks...`);
  const scored = allEmbeddings.map(emb => {
    const vector = emb.embedding as number[];
    const similarity = cosineSimilarity(queryVector, vector);

    return {
      documentId: emb.documentId,
      chunkId: emb.id,
      chunkText: emb.chunkText,
      score: similarity,
      vector
    };
  });

  // Step 4: Filter by min score and sort
  const filtered = scored
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score);

  console.log(`[RAG] Found ${filtered.length} results above threshold ${minScore}`);

  // Step 5: Get metadata if needed
  if (includeMetadata && filtered.length > 0) {
    const docIds = Array.from(new Set(filtered.map(r => r.documentId)));
    const docs = await db
      .select()
      .from(documents)
      .where(sql`${documents.id} IN ${sql.raw(`(${docIds.join(',')})`)}`);

    const docMap = new Map(docs.map(d => [d.id, d]));

    return filtered.slice(0, limit).map(r => {
      const doc = docMap.get(r.documentId);
      const docMetadata = doc?.metadata as any;
      
      // Extrai imagens do metadata
      const imageUrls = docMetadata?.images || [];
      
      // Converte URLs de imagens em attachments
      const attachments = imageUrls.map((imgUrl: string) => ({
        type: "image" as const,
        url: imgUrl,
        filename: imgUrl.split('/').pop() || 'image.jpg',
        mimeType: 'image/jpeg',
        size: 0
      }));
      
      return {
        documentId: r.documentId,
        chunkId: r.chunkId,
        chunkText: r.chunkText,
        score: r.score,
        metadata: doc ? {
          title: doc.title,
          source: doc.source,
          url: doc.metadata?.url as string | undefined,
          images: imageUrls
        } : undefined,
        attachments: attachments.length > 0 ? attachments : undefined
      };
    });
  }

  return filtered.slice(0, limit);
}

// ============================================================================
// BM25 LEXICAL SEARCH
// ============================================================================

function bm25Score(
  query: string,
  document: string,
  avgDocLength: number,
  k1: number = 1.5,
  b: number = 0.75
): number {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const docTerms = document.toLowerCase().split(/\s+/);
  const docLength = docTerms.length;

  // Term frequency
  const termFreq = new Map<string, number>();
  for (const term of docTerms) {
    termFreq.set(term, (termFreq.get(term) || 0) + 1);
  }

  let score = 0;

  for (const term of queryTerms) {
    const tf = termFreq.get(term) || 0;
    
    // BM25 formula
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
    
    score += numerator / denominator;
  }

  return score;
}

export async function lexicalSearch(
  query: string,
  tenantId: number,
  limit: number = 10
): Promise<SearchResult[]> {
  // Get all chunks
  const allChunks = await db
    .select()
    .from(embeddings)
    .where(eq(embeddings.tenantId, tenantId));

  if (allChunks.length === 0) {
    return [];
  }

  // Calculate average document length
  const avgLength = allChunks.reduce((sum, c) => sum + c.chunkText.length, 0) / allChunks.length;

  // Score all chunks
  const scored = allChunks.map(chunk => ({
    documentId: chunk.documentId,
    chunkId: chunk.id,
    chunkText: chunk.chunkText,
    score: bm25Score(query, chunk.chunkText, avgLength)
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ============================================================================
// HYBRID SEARCH (Semantic + Lexical)
// ============================================================================

export async function hybridSearch(
  query: string,
  tenantId: number,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { limit = 10, minScore = 0.3 } = options;

  console.log('[RAG] Performing hybrid search...');

  // Run both searches in parallel
  const [semanticResults, lexicalResults] = await Promise.all([
    semanticSearch(query, tenantId, { limit: limit * 2, minScore, includeMetadata: false }),
    lexicalSearch(query, tenantId, limit * 2)
  ]);

  // Normalize scores to [0, 1]
  const maxSemantic = Math.max(...semanticResults.map(r => r.score), 1);
  const maxLexical = Math.max(...lexicalResults.map(r => r.score), 1);

  const normalizedSemantic = semanticResults.map(r => ({
    ...r,
    score: r.score / maxSemantic
  }));

  const normalizedLexical = lexicalResults.map(r => ({
    ...r,
    score: r.score / maxLexical
  }));

  // Combine scores (weighted average: 70% semantic, 30% lexical)
  const combinedScores = new Map<number, { chunk: any; score: number }>();

  for (const result of normalizedSemantic) {
    combinedScores.set(result.chunkId, {
      chunk: result,
      score: result.score * 0.7
    });
  }

  for (const result of normalizedLexical) {
    const existing = combinedScores.get(result.chunkId);
    if (existing) {
      existing.score += result.score * 0.3;
    } else {
      combinedScores.set(result.chunkId, {
        chunk: result,
        score: result.score * 0.3
      });
    }
  }

  // Sort by combined score
  const sorted = Array.from(combinedScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => ({
      ...item.chunk,
      score: item.score
    }));

  console.log(`[RAG] Hybrid search returned ${sorted.length} results`);

  return sorted;
}

// ============================================================================
// MMR (Maximal Marginal Relevance) - Diversity Re-ranking
// ============================================================================

export async function mmrSearch(
  query: string,
  tenantId: number,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    limit = 10,
    minScore = 0.3,
    lambda = 0.7,  // Balance: 0.7 = 70% relevance, 30% diversity
    includeMetadata = true
  } = options;

  console.log(`[RAG] Performing MMR search (λ=${lambda})...`);

  // Step 1: Get initial candidates (2x limit)
  const candidates = await semanticSearch(query, tenantId, {
    limit: limit * 3,
    minScore,
    includeMetadata: false
  });

  if (candidates.length === 0) {
    return [];
  }

  // Step 2: Get query vector
  const queryVector = await embedText(query);

  // Step 3: Get all candidate vectors
  const candidateVectors = await db
    .select()
    .from(embeddings)
    .where(sql`${embeddings.id} IN ${sql.raw(`(${candidates.map(c => c.chunkId).join(',')})`)}`);

  const vectorMap = new Map(
    candidateVectors.map(v => [v.id, v.embedding as number[]])
  );

  // Step 4: MMR selection
  const selected: SearchResult[] = [];
  const remaining = [...candidates];

  // Select first (most relevant)
  selected.push(remaining.shift()!);

  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const candidateVector = vectorMap.get(candidate.chunkId);
      
      if (!candidateVector) continue;

      // Relevance score
      const relevance = cosineSimilarity(queryVector, candidateVector);

      // Max similarity to already selected
      let maxSimilarity = 0;
      for (const selectedResult of selected) {
        const selectedVector = vectorMap.get(selectedResult.chunkId);
        if (selectedVector) {
          const sim = cosineSimilarity(candidateVector, selectedVector);
          maxSimilarity = Math.max(maxSimilarity, sim);
        }
      }

      // MMR formula: λ * relevance - (1 - λ) * maxSimilarity
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    // Add best candidate and remove from remaining
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  console.log(`[RAG] MMR selected ${selected.length} diverse results`);

  // Step 5: Add metadata if needed
  if (includeMetadata) {
    const docIds = Array.from(new Set(selected.map(r => r.documentId)));
    const docs = await db
      .select()
      .from(documents)
      .where(sql`${documents.id} IN ${sql.raw(`(${docIds.join(',')})`)}`);

    const docMap = new Map(docs.map(d => [d.id, d]));

    return selected.map(r => {
      const doc = docMap.get(r.documentId);
      return {
        ...r,
        metadata: doc ? {
          title: doc.title,
          source: doc.source,
          url: doc.metadata?.url as string | undefined
        } : undefined
      };
    });
  }

  return selected;
}

// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

export async function searchWithConfidence(
  query: string,
  tenantId: number,
  options: SearchOptions = {}
): Promise<ConfidenceResult> {
  const { limit = 5, lambda = 0.7 } = options;

  // Perform MMR search
  const results = await mmrSearch(query, tenantId, {
    ...options,
    limit,
    lambda
  });

  if (results.length === 0) {
    return {
      confidence: 0,
      threshold: 0.6,
      shouldFallback: true,
      topResults: []
    };
  }

  // Calculate confidence as average of top-k scores
  const topK = Math.min(3, results.length);
  const topScores = results.slice(0, topK).map(r => r.score);
  const avgScore = topScores.reduce((sum, s) => sum + s, 0) / topScores.length;

  // Adjust confidence based on result count
  const countPenalty = results.length < limit ? 0.9 : 1.0;
  const confidence = avgScore * countPenalty;

  // Threshold for fallback (τ = 0.6 from PDFs)
  const threshold = 0.6;
  const shouldFallback = confidence < threshold;

  console.log(`[RAG] Confidence: ${confidence.toFixed(3)} (threshold: ${threshold})`);
  console.log(`[RAG] Should fallback: ${shouldFallback}`);

  return {
    confidence,
    threshold,
    shouldFallback,
    topResults: results
  };
}

// ============================================================================
// CONTEXT BUILDER (for LLM prompts)
// ============================================================================

export function buildContext(results: SearchResult[], maxTokens: number = 3000): string {
  let context = '';
  let tokens = 0;

  for (const result of results) {
    const chunk = result.chunkText;
    const chunkTokens = Math.ceil(chunk.length / 4);  // Rough estimate

    if (tokens + chunkTokens > maxTokens) {
      break;
    }

    const source = result.metadata?.title || `Document ${result.documentId}`;
    context += `[Source: ${source}]\n${chunk}\n\n`;
    tokens += chunkTokens;
  }

  return context.trim();
}
