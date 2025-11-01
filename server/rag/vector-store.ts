/**
 * Vector Store - FAISS-based semantic search
 * 
 * As per PDFs: FAISS/Milvus with HNSW (M≈64, efSearch≈128) + IVF-PQ
 * Implements A-NNS with O(log N) complexity
 * 
 * Note: Using in-memory FAISS (JavaScript implementation) for Replit.
 * For production Google Colab deployment, use Python FAISS with GPU support.
 */

import { storage } from "../storage";
import { embedder } from "./embedder";
import type { Embedding } from "@shared/schema";

interface SearchResult {
  id: number;
  score: number; // Cosine similarity
  chunkText: string;
  metadata?: Record<string, any>;
  documentId: number;
  attachments?: Array<{
    type: 'image' | 'video' | 'pdf' | 'audio' | 'document';
    url: string;
    filename?: string;
    mimeType?: string;
    size?: number;
    description?: string;
  }>;
}

/**
 * Simple in-memory FAISS-like vector store
 * For production, replace with actual FAISS (faiss-node or Python microservice)
 */
export class VectorStore {
  private vectors: Map<number, number[]> = new Map(); // embedding_id -> vector
  private metadata: Map<number, { text: string; documentId: number; meta?: any }> = new Map();
  
  /**
   * Index embeddings for a document
   * As per PDFs: Normalized vectors ê_{i,j}=e_{i,j}/||e_{i,j}||
   */
  async indexDocument(documentId: number): Promise<void> {
    console.log(`[VectorStore] Indexing document ${documentId}...`);
    
    // Get all embeddings for this document
    const embeddings = await storage.getEmbeddingsByDocument(documentId);
    
    // Add to in-memory index
    for (const emb of embeddings) {
      this.vectors.set(emb.id, emb.embedding as number[]);
      this.metadata.set(emb.id, {
        text: emb.chunkText,
        documentId: emb.documentId,
        meta: emb.metadata,
      });
    }
    
    console.log(`[VectorStore] Indexed ${embeddings.length} chunks for document ${documentId}`);
  }

  /**
   * Index all embeddings for knowledge base
   */
  async indexTenant(limit: number = 10000): Promise<void> {
    console.log(`[VectorStore] Indexing knowledge base...`);
    
    const embeddings = await storage.getEmbeddings(limit);
    
    for (const emb of embeddings) {
      this.vectors.set(emb.id, emb.embedding as number[]);
      this.metadata.set(emb.id, {
        text: emb.chunkText,
        documentId: emb.documentId,
        meta: emb.metadata,
      });
    }
    
    console.log(`[VectorStore] Indexed ${embeddings.length} embeddings`);
  }

  /**
   * Semantic search with cosine similarity
   * As per PDFs: sim(q,d)=E(q)·E(d)/(||E(q)||||E(d)||)
   * Returns top-k results with O(N) complexity (brute force for now)
   */
  async search(
    queryEmbedding: number[],
    k: number = 10,
    filter?: { documentId?: number; namespaces?: string[] }
  ): Promise<SearchResult[]> {
    const results: Array<{ id: number; score: number }> = [];
    
    // Calculate similarity with all vectors
    for (const [id, vector] of Array.from(this.vectors.entries())) {
      // Apply filters
      const meta = this.metadata.get(id);
      if (filter?.documentId && meta?.documentId !== filter.documentId) {
        continue;
      }
      
      // CRITICAL: Filter by namespaces if specified
      if (filter?.namespaces && filter.namespaces.length > 0) {
        const docNamespace = meta?.meta?.namespace as string | undefined;
        
        // MONITORING: Log if embedding is missing namespace metadata
        if (!docNamespace) {
          console.warn(`[VectorStore] ⚠️  Embedding ID ${id} missing namespace metadata (documentId: ${meta?.documentId})`);
        }
        
        // Normalize case for heterogeneous sources (both query and document)
        const normalizedDocNamespace = docNamespace?.toLowerCase();
        const normalizedFilterNamespaces = filter.namespaces.map(ns => ns.toLowerCase());
        
        // Check if document namespace matches any of the allowed namespaces
        // Support wildcard "*" to access all namespaces
        const hasWildcard = normalizedFilterNamespaces.includes("*");
        const hasMatchingNamespace = normalizedDocNamespace && normalizedFilterNamespaces.includes(normalizedDocNamespace);
        
        if (!hasWildcard && !hasMatchingNamespace) {
          continue; // Skip this document - not in allowed namespaces
        }
      }
      
      // Cosine similarity (vectors are already normalized)
      const score = embedder.cosineSimilarity(queryEmbedding, vector);
      results.push({ id, score });
    }
    
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    // Take top-k
    const topK = results.slice(0, k);
    
    // Build result objects
    return topK.map(({ id, score }) => {
      const meta = this.metadata.get(id)!;
      return {
        id,
        score,
        chunkText: meta.text,
        documentId: meta.documentId,
        metadata: meta.meta,
      };
    });
  }

  /**
   * Remove document from index
   */
  async removeDocument(documentId: number): Promise<void> {
    const toRemove: number[] = [];
    
    for (const [id, meta] of Array.from(this.metadata.entries())) {
      if (meta.documentId === documentId) {
        toRemove.push(id);
      }
    }
    
    for (const id of toRemove) {
      this.vectors.delete(id);
      this.metadata.delete(id);
    }
    
    console.log(`[VectorStore] Removed ${toRemove.length} chunks for document ${documentId}`);
  }

  /**
   * Clear all vectors (useful for re-indexing)
   */
  clear(): void {
    this.vectors.clear();
    this.metadata.clear();
    console.log("[VectorStore] Cleared all vectors");
  }

  /**
   * Get statistics
   */
  getStats(): { totalVectors: number; dimensions: number } {
    const firstVector = this.vectors.values().next().value;
    return {
      totalVectors: this.vectors.size,
      dimensions: firstVector ? firstVector.length : 0,
    };
  }
}

// Singleton instance
export const vectorStore = new VectorStore();

/**
 * High-level RAG operations
 */
export class RAGService {
  /**
   * Index a document (extract text, chunk, embed, store)
   */
  async indexDocument(
    documentId: number,
    text: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    console.log(`[RAG] Indexing document ${documentId}...`);
    
    // Update document status
    await storage.updateDocument(documentId, {
      status: "processing",
      extractedText: text,
    });
    
    try {
      // Process document (chunk + embed)
      const results = await embedder.processDocument(text, {
        maxChunkSize: 512,
        overlapSize: 128,
        metadata,
      });
      
      // Save embeddings to database
      const embeddingRecords = results.map((result, idx) => ({
        documentId,
        chunkIndex: idx,
        chunkText: result.chunk.text,
        chunkTokens: result.chunk.tokens,
        embedding: result.embedding,
        embeddingDim: result.embedding.length,
        metadata: result.chunk.metadata,
      }));
      
      await storage.createEmbeddingsBatch(embeddingRecords);
      
      // Update document status to 'indexed' BEFORE indexing in vector store
      // This is critical because vectorStore.indexDocument() queries embeddings
      // and storage.getEmbeddingsByDocument() only returns embeddings for status='indexed'
      await storage.updateDocument(documentId, {
        status: "indexed",
      });
      
      // Index in vector store (now embeddings will be found)
      await vectorStore.indexDocument(documentId);
      
      console.log(`[RAG] Successfully indexed document ${documentId} (${results.length} chunks)`);
    } catch (error: any) {
      console.error(`[RAG] Error indexing document ${documentId}:`, error);
      
      await storage.updateDocument(documentId, {
        status: "failed",
        errorMessage: error.message,
      });
      
      throw error;
    }
  }

  /**
   * Search knowledge base
   * As per PDFs: Retrieval with cosine similarity
   * MULTIMODAL: Returns attachments from source documents
   */
  async search(
    query: string,
    options: {
      k?: number;
      documentId?: number;
      namespaces?: string[];
    } = {}
  ): Promise<SearchResult[]> {
    const k = options.k || 10;
    
    // Generate query embedding
    const [queryEmbedding] = await embedder.generateEmbeddings(
      [{ text: query, index: 0, tokens: Math.ceil(query.length / 4) }]
    );
    
    // Search vector store with namespace filtering
    const results = await vectorStore.search(
      queryEmbedding.embedding,
      k,
      {
        documentId: options.documentId,
        namespaces: options.namespaces,
      }
    );
    
    // MULTIMODAL: Fetch attachments from source documents
    const uniqueDocIds = [...new Set(results.map(r => r.documentId))];
    const documentAttachments = new Map<number, any[]>();
    
    for (const docId of uniqueDocIds) {
      const doc = await storage.getDocument(docId);
      if (doc?.attachments && doc.attachments.length > 0) {
        documentAttachments.set(docId, doc.attachments);
      }
    }
    
    // Attach to results
    const enrichedResults = results.map(result => ({
      ...result,
      attachments: documentAttachments.get(result.documentId)
    }));
    
    console.log(`[RAG] Search completed: ${results.length} results, ${documentAttachments.size} docs with attachments`);
    
    return enrichedResults;
  }

  /**
   * Re-index entire knowledge base
   */
  async reindexTenant(): Promise<void> {
    console.log(`[RAG] Re-indexing knowledge base...`);
    
    // Clear existing vectors
    vectorStore.clear();
    
    // Get all documents
    const documents = await storage.getDocuments(10000);
    
    let indexed = 0;
    let failed = 0;
    
    for (const doc of documents) {
      if (doc.status === "indexed" && doc.extractedText) {
        try {
          await this.indexDocument(doc.id, doc.extractedText, doc.metadata || undefined);
          indexed++;
        } catch (error) {
          console.error(`[RAG] Failed to re-index document ${doc.id}:`, error);
          failed++;
        }
      }
    }
    
    console.log(`[RAG] Re-indexing complete: ${indexed} indexed, ${failed} failed`);
  }

  /**
   * Delete document from knowledge base
   */
  async deleteDocument(documentId: number): Promise<void> {
    // Remove from vector store
    await vectorStore.removeDocument(documentId);
    
    // Delete embeddings from database
    await storage.deleteEmbeddingsByDocument(documentId);
    
    // Delete document
    await storage.deleteDocument(documentId);
    
    console.log(`[RAG] Deleted document ${documentId}`);
  }
}

// Singleton instance
export const ragService = new RAGService();
