/**
 * Embedder - Generate semantic embeddings for RAG
 * 
 * As per PDFs: E:X→R^d with normalized vectors ê_{i,j}=e_{i,j}/||e_{i,j}||
 * 
 * Implements:
 * - Text chunking with overlap
 * - Semantic splitting
 * - Embedding generation with normalization
 * - Batch processing for efficiency
 */

import { llmClient } from "../model/llm-client";

export interface ChunkOptions {
  maxChunkSize?: number; // tokens
  overlapSize?: number; // tokens
  preserveFormatting?: boolean; // For LaTeX/formulas
}

export interface TextChunk {
  text: string;
  index: number;
  tokens: number;
  metadata?: {
    section?: string;
    page?: number;
    heading?: string;
  };
}

export class Embedder {
  /**
   * Chunk text into overlapping segments
   * As per PDFs: Chunking strategies preserve context
   */
  chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
    const maxChunkSize = options.maxChunkSize || 512;
    const overlapSize = options.overlapSize || 128;
    
    // Rough tokenization (4 chars ≈ 1 token for English)
    const estimatedTokens = Math.ceil(text.length / 4);
    
    if (estimatedTokens <= maxChunkSize) {
      // Text fits in one chunk
      return [{
        text,
        index: 0,
        tokens: estimatedTokens,
      }];
    }

    const chunks: TextChunk[] = [];
    const sentences = this.splitIntoSentences(text);
    
    let currentChunk: string[] = [];
    let currentTokens = 0;
    let chunkIndex = 0;

    for (const sentence of sentences) {
      const sentenceTokens = Math.ceil(sentence.length / 4);
      
      if (currentTokens + sentenceTokens > maxChunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          text: currentChunk.join(" "),
          index: chunkIndex++,
          tokens: currentTokens,
        });
        
        // Start new chunk with overlap
        const overlapSentences = this.getOverlapSentences(currentChunk, overlapSize);
        currentChunk = overlapSentences;
        currentTokens = Math.ceil(currentChunk.join(" ").length / 4);
      }
      
      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
    }

    // Add last chunk
    if (currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join(" "),
        index: chunkIndex,
        tokens: currentTokens,
      });
    }

    return chunks;
  }

  /**
   * Split text into sentences (simple implementation)
   */
  private splitIntoSentences(text: string): string[] {
    // Preserve LaTeX formulas and code blocks
    const protectedText = text
      .replace(/\$\$[\s\S]*?\$\$/g, (match) => `__LATEX_${Buffer.from(match).toString('base64')}__`)
      .replace(/\$[^$]+\$/g, (match) => `__LATEX_${Buffer.from(match).toString('base64')}__`)
      .replace(/```[\s\S]*?```/g, (match) => `__CODE_${Buffer.from(match).toString('base64')}__`);

    // Split on sentence boundaries
    const sentences = protectedText
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Restore protected content
    return sentences.map(s =>
      s.replace(/__LATEX_([A-Za-z0-9+/=]+)__/g, (_, b64) => Buffer.from(b64, 'base64').toString())
       .replace(/__CODE_([A-Za-z0-9+/=]+)__/g, (_, b64) => Buffer.from(b64, 'base64').toString())
    );
  }

  /**
   * Get last N sentences for overlap
   */
  private getOverlapSentences(sentences: string[], overlapTokens: number): string[] {
    const overlap: string[] = [];
    let tokens = 0;
    
    for (let i = sentences.length - 1; i >= 0 && tokens < overlapTokens; i--) {
      const sentence = sentences[i];
      overlap.unshift(sentence);
      tokens += Math.ceil(sentence.length / 4);
    }
    
    return overlap;
  }

  /**
   * Generate embeddings for chunks
   * As per PDFs: Similarity cos(q,d)=E(q)·E(d)/(||E(q)||||E(d)||)
   * Returns normalized embeddings
   */
  async generateEmbeddings(chunks: TextChunk[]): Promise<Array<{ chunk: TextChunk; embedding: number[] }>> {
    // Extract text from chunks
    const texts = chunks.map(c => c.text);
    
    // Generate embeddings via LLM client
    const rawEmbeddings = await llmClient.generateEmbeddings(texts);
    
    // Normalize embeddings: ê = e/||e||
    const normalizedEmbeddings = rawEmbeddings.map(embedding => this.normalize(embedding));
    
    // Combine chunks with embeddings
    return chunks.map((chunk, i) => ({
      chunk,
      embedding: normalizedEmbeddings[i],
    }));
  }

  /**
   * Normalize vector to unit length
   * As per PDFs: ê_{i,j}=e_{i,j}/||e_{i,j}||
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vector;
    return vector.map(val => val / magnitude);
  }

  /**
   * Calculate cosine similarity between normalized vectors
   * As per PDFs: sim(q,d)=E(q)·E(d) (since vectors are normalized)
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have same dimension");
    }
    
    // Dot product (since vectors are normalized, this is cosine similarity)
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  /**
   * Batch process documents for embedding
   */
  async processDocument(
    text: string,
    options: ChunkOptions & { metadata?: Record<string, any> } = {}
  ): Promise<Array<{ chunk: TextChunk; embedding: number[] }>> {
    // Chunk text
    const chunks = this.chunkText(text, options);
    
    // Add metadata to chunks
    if (options.metadata) {
      chunks.forEach(chunk => {
        chunk.metadata = { ...chunk.metadata, ...options.metadata };
      });
    }
    
    // Generate embeddings
    const results = await this.generateEmbeddings(chunks);
    
    console.log(`[Embedder] Processed document: ${chunks.length} chunks`);
    
    return results;
  }
}

// Singleton instance
export const embedder = new Embedder();
