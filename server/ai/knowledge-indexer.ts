/**
 * AION Supreme - Knowledge Base Indexer
 * Smart Chunking + Embedding + Automatic RAG Integration
 */

import { db } from '../db';
import { documents, embeddings } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { embedText } from './embedder';

// ============================================================================
// SMART CHUNKING
// ============================================================================

export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
  minChars?: number;
}

export function smartChunk(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const {
    maxChars = 1200,
    overlap = 200,
    minChars = 400
  } = options;

  const chunks: string[] = [];
  let i = 0;

  while (i < text.length) {
    const end = Math.min(text.length, i + maxChars);
    
    // Try to cut at sentence boundary
    let cut = end;
    
    // Look backwards for sentence end
    for (let j = end; j > i + minChars && j > end - 200; j--) {
      if (text[j] === '.' || text[j] === '!' || text[j] === '?') {
        // Check if it's actually end of sentence (not abbreviation)
        if (j + 1 < text.length && /\s/.test(text[j + 1])) {
          cut = j + 1;
          break;
        }
      }
    }

    // If no sentence boundary found, try paragraph
    if (cut === end) {
      const paragraphEnd = text.indexOf('\n\n', i + minChars);
      if (paragraphEnd !== -1 && paragraphEnd < end) {
        cut = paragraphEnd + 2;
      }
    }

    const chunk = text.substring(i, cut).trim();
    
    if (chunk.length >= minChars / 2) {  // Only add if meaningful
      chunks.push(chunk);
    }

    // Move forward with overlap
    i = Math.max(cut - overlap, i + 1);
  }

  return chunks.filter(c => c.length > 0);
}

// ============================================================================
// DOCUMENT INDEXING
// ============================================================================

export async function indexDocumentComplete(
  documentId: number,
  content: string,
  options: ChunkOptions = {}
): Promise<number> {
  
  console.log(`[Indexer] Indexing document ${documentId}...`);

  // Step 1: Smart chunking
  const chunks = smartChunk(content, options);
  console.log(`[Indexer] Created ${chunks.length} chunks`);

  if (chunks.length === 0) {
    throw new Error('No chunks created from content');
  }

  // Step 2: Delete existing chunks for this document
  await db.delete(embeddings).where(eq(embeddings.documentId, documentId));

  // Step 3: Embed and save chunks
  let indexed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      // Embed chunk
      const vector = await embedText(chunk);
      const tokenCount = Math.ceil(chunk.length / 4);  // Rough estimate

      // Save to database
      await db.insert(embeddings).values({
        documentId,
        chunkIndex: i,
        chunkText: chunk,
        chunkTokens: tokenCount,
        embedding: vector,
        embeddingDim: vector.length,
        createdAt: sql`NOW()`
      });

      indexed++;

      if (indexed % 10 === 0) {
        console.log(`[Indexer] Progress: ${indexed}/${chunks.length} chunks indexed`);
      }

    } catch (error: any) {
      console.error(`[Indexer] Failed to index chunk ${i}:`, error.message);
    }
  }

  console.log(`[Indexer] ✓ Indexed ${indexed} chunks for document ${documentId}`);

  return indexed;
}

// ============================================================================
// BATCH INDEXING
// ============================================================================

export async function reindexAllDocuments(): Promise<number> {
  console.log('[Indexer] Starting full reindexing...');

  const docs = await db.select()
    .from(documents);

  console.log(`[Indexer] Found ${docs.length} documents`);

  let totalChunks = 0;

  for (const doc of docs) {
    try {
      const chunks = await indexDocumentComplete(doc.id, doc.content);
      totalChunks += chunks;
    } catch (error: any) {
      console.error(`[Indexer] Failed to reindex document ${doc.id}:`, error.message);
    }
  }

  console.log(`[Indexer] ✓ Reindexing complete: ${totalChunks} total chunks`);

  return totalChunks;
}

// ============================================================================
// QUALITY SCORING
// ============================================================================

export function calculateEntropy(text: string): number {
  if (text.length === 0) return 0;

  const freq: { [char: string]: number } = {};
  
  for (const char of text) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  const len = text.length;

  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy / Math.log2(256);  // Normalize to [0, 1]
}

export function scoreDocumentQuality(text: string): number {
  // Entropy (information density)
  const entropy = calculateEntropy(text);

  // Length score (prefer longer, more complete docs)
  const lengthScore = Math.min(1, text.length / 10000);

  // Sentence structure (prefer well-formed text)
  const sentenceCount = (text.match(/[.!?]+/g) || []).length;
  const avgSentenceLength = text.length / Math.max(1, sentenceCount);
  const structureScore = avgSentenceLength > 20 && avgSentenceLength < 200 ? 1 : 0.5;

  // Word diversity
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const uniqueWords = new Set(words);
  const diversityScore = uniqueWords.size / Math.max(1, words.length);

  // Weighted combination
  const score = (
    entropy * 0.3 +
    lengthScore * 0.2 +
    structureScore * 0.2 +
    diversityScore * 0.3
  );

  return Math.min(1, Math.max(0, score));
}
