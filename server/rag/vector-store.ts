/**
 * Vector Store - Busca semântica baseada em FAISS
 * 
 * Conforme PDFs: FAISS/Milvus com HNSW (M≈64, efSearch≈128) + IVF-PQ
 * Implementa A-NNS com complexidade O(log N)
 * 
 * Nota: Usando FAISS em memória (implementação JavaScript) para Replit.
 * Para produção no Google Colab, usar FAISS Python com suporte GPU.
 */

import { storage } from "../storage";
import { embedder } from "./embedder";
import type { Embedding } from "@shared/schema";
import { usageTracker } from "../services/usage-tracker";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

interface SearchResult {
  id: number;
  score: number; // Similaridade cosseno
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
 * Vector store simples em memória - MVP IMPLEMENTATION
 * 
 * ⚠️  PERFORMANCE LIMITATIONS (CRITICAL):
 * - Complexity: O(N) brute-force cosine similarity for ALL searches
 * - Scales up to ~10k embeddings with acceptable performance (<500ms)
 * - Beyond 10k embeddings: Search latency degrades linearly O(N)
 * - NO approximate nearest neighbor (ANN) indexing (HNSW/IVF)
 * 
 * ⚠️  CONCURRENCY LIMITATIONS (CRITICAL):
 * - NO mutex/locking for concurrent operations
 * - Race condition: indexDocument() + removeDocument() called concurrently
 * - Race condition: Multiple indexDocument() calls for same doc
 * - Shared state: this.vectors and this.metadata Maps modified without sync
 * - SAFE USAGE: Single-threaded event loop OR queue all operations
 * 
 * 🚀 PRODUCTION REQUIREMENTS:
 * - Replace with FAISS Python service (HNSW/IVF index) for O(log N) search
 * - Use faiss-node binding OR Python microservice with GPU acceleration
 * - Implement async batch indexing + persistent storage (Redis/Postgres pgvector)
 * - Add sharding for large-scale deployment (100k+ embeddings)
 * - Add proper locking/mutex for concurrent operations (p-queue or async-mutex)
 * 
 * ✅ CURRENT USE CASE: MVP/Development with HITL curated content (small KB)
 * ❌ NOT SUITABLE: Large-scale production (>10k docs), real-time inference at scale, high-concurrency
 */
export class VectorStore {
  private vectors: Map<number, number[]> = new Map(); // embedding_id -> vetor
  private metadata: Map<number, { text: string; documentId: number; meta?: any }> = new Map();
  private indexingInProgress: Set<number> = new Set(); // Track docs being indexed (basic concurrency guard)
  
  /**
   * Indexar embeddings de um documento
   * Conforme PDFs: Vetores normalizados ê_{i,j}=e_{i,j}/||e_{i,j}||
   * 
   * ⚠️  CONCURRENCY: Basic guard against concurrent indexing of same document
   * - Prevents race condition where same doc indexed twice simultaneously
   * - Does NOT prevent race with removeDocument() - caller must serialize
   */
  async indexDocument(documentId: number): Promise<void> {
    // Basic concurrency guard - prevent concurrent indexing of same doc
    if (this.indexingInProgress.has(documentId)) {
      console.warn(`[VectorStore] Document ${documentId} already being indexed, skipping...`);
      return;
    }
    
    this.indexingInProgress.add(documentId);
    
    try {
      console.log(`[VectorStore] Indexando documento ${documentId}...`);
      
      // Obter todos os embeddings deste documento
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
    } finally {
      this.indexingInProgress.delete(documentId);
    }
  }

  /**
   * Indexar todos os embeddings da base de conhecimento
   */
  async indexTenant(limit: number = 10000): Promise<void> {
    console.log(`[VectorStore] Indexando base de conhecimento...`);
    
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
   * Busca semântica com similaridade cosseno
   * Conforme PDFs: sim(q,d)=E(q)·E(d)/(||E(q)||||E(d)||)
   * 
   * ⚠️  PERFORMANCE WARNING: O(N) brute-force search!
   * - Iterates through ALL embeddings in memory for EVERY query
   * - Acceptable for MVP (<10k embeddings), NOT for production scale
   * - For >10k embeddings: Replace with FAISS HNSW/IVF index (O(log N))
   */
  async search(
    queryEmbedding: number[],
    k: number = 10,
    filter?: { documentId?: number; namespaces?: string[] }
  ): Promise<SearchResult[]> {
    const results: Array<{ id: number; score: number }> = [];
    
    // BRUTE-FORCE: Calcular similaridade com TODOS os vetores (O(N))
    // TODO PRODUCTION: Replace with FAISS IndexHNSW or IndexIVF (O(log N))
    for (const [id, vector] of Array.from(this.vectors.entries())) {
      // Aplicar filtros
      const meta = this.metadata.get(id);
      if (filter?.documentId && meta?.documentId !== filter.documentId) {
        continue;
      }
      
      // CRÍTICO: Filtrar por namespaces se especificado
      if (filter?.namespaces && filter.namespaces.length > 0) {
        const docNamespace = meta?.meta?.namespace as string | undefined;
        
        // MONITORAMENTO: Registrar se embedding está sem metadata de namespace
        if (!docNamespace) {
          console.warn(`[VectorStore] ⚠️  Embedding ID ${id} sem metadata de namespace (documentId: ${meta?.documentId})`);
        }
        
        // Normalizar maiúsculas/minúsculas para fontes heterogêneas (query e documento)
        const normalizedDocNamespace = docNamespace?.toLowerCase();
        const normalizedFilterNamespaces = filter.namespaces.map(ns => ns.toLowerCase());
        
        // Verificar se namespace do documento corresponde a algum dos namespaces permitidos
        // Suporte a wildcard "*" para acessar todos os namespaces
        const hasWildcard = normalizedFilterNamespaces.includes("*");
        const hasMatchingNamespace = normalizedDocNamespace && normalizedFilterNamespaces.includes(normalizedDocNamespace);
        
        if (!hasWildcard && !hasMatchingNamespace) {
          continue; // Pular este documento - não está nos namespaces permitidos
        }
      }
      
      // Similaridade cosseno (vetores já estão normalizados)
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

  /**
   * 💾 FASE 1 - Vector Store Persistente
   * Salva snapshot do index em disco para persistir entre restarts
   */
  private snapshotPath = process.env.VECTOR_SNAPSHOT_PATH || "./data/vectorstore.snapshot.json";

  async save(): Promise<void> {
    try {
      const snapshot = {
        vectors: Object.fromEntries(this.vectors.entries()),
        metadata: Object.fromEntries(this.metadata.entries()),
        timestamp: new Date().toISOString(),
        stats: this.getStats()
      };

      const dir = path.dirname(this.snapshotPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.snapshotPath, JSON.stringify(snapshot, null, 2));
      console.log(`[VectorStore] 💾 Snapshot salvo: ${this.vectors.size} vectors (${this.snapshotPath})`);
    } catch (error) {
      console.error("[VectorStore] ❌ Erro ao salvar snapshot:", error);
    }
  }

  async load(): Promise<void> {
    try {
      try {
        await fs.access(this.snapshotPath);
      } catch {
        console.log("[VectorStore] ℹ️  Nenhum snapshot encontrado, iniciando com index vazio");
        return;
      }

      const data = await fs.readFile(this.snapshotPath, "utf-8");
      const snapshot = JSON.parse(data);

      this.vectors = new Map(Object.entries(snapshot.vectors).map(([k, v]) => [Number(k), v as number[]]));
      this.metadata = new Map(Object.entries(snapshot.metadata).map(([k, v]) => [Number(k), v as any]));

      console.log(`[VectorStore] ✅ Snapshot carregado: ${this.vectors.size} vectors (salvo em ${snapshot.timestamp})`);
    } catch (error) {
      console.error("[VectorStore] ❌ Erro ao carregar snapshot:", error);
      console.log("[VectorStore] ⚠️  Iniciando com index vazio");
      this.vectors.clear();
      this.metadata.clear();
    }
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[RAG] Error indexing document ${documentId}:`, error);
      
      await storage.updateDocument(documentId, {
        status: "failed",
        errorMessage: errorMessage,
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
    
    // CRITICAL FIX: Truncate query to prevent "maximum context length" error
    // OpenAI embeddings API has 8192 token limit, we use conservative 1000 token limit
    const MAX_QUERY_TOKENS = 1000;
    const MAX_QUERY_CHARS = MAX_QUERY_TOKENS * 4; // Approx 4 chars per token
    
    let truncatedQuery = query;
    if (query.length > MAX_QUERY_CHARS) {
      truncatedQuery = query.substring(0, MAX_QUERY_CHARS);
      console.warn(`[RAG] Query truncated from ${query.length} to ${MAX_QUERY_CHARS} chars (original: ${Math.ceil(query.length / 4)} tokens, limit: ${MAX_QUERY_TOKENS} tokens)`);
    }
    
    // Generate query embedding
    const [queryEmbedding] = await embedder.generateEmbeddings(
      [{ text: truncatedQuery, index: 0, tokens: Math.ceil(truncatedQuery.length / 4) }]
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
    
    // MULTIMODAL + HEALTHY FORGETTING: Fetch attachments + apply temporal degradation
    const uniqueDocIds = Array.from(new Set(results.map(r => r.documentId)));
    const documentAttachments = new Map<number, any[]>();
    const documentCreatedAt = new Map<number, Date>();
    
    for (const docId of uniqueDocIds) {
      const doc = await storage.getDocument(docId);
      if (doc) {
        if (doc.attachments && doc.attachments.length > 0) {
          documentAttachments.set(docId, doc.attachments);
        }
        if (doc.createdAt) {
          documentCreatedAt.set(docId, doc.createdAt);
        }
      }
    }
    
    // HEALTHY FORGETTING: Apply temporal degradation (freshness boost)
    // Recent documents get higher priority, old documents gradually decay
    const now = new Date();
    const AGE_WEIGHT = 0.3; // 30% max degradation
    const MAX_AGE_DAYS = 1825; // 5 years
    
    const resultsWithFreshness = results.map(result => {
      const createdAt = documentCreatedAt.get(result.documentId);
      let freshnessFactor = 1.0;
      
      if (createdAt) {
        // Normalize to Date instance (handles both Date and ISO string)
        const createdAtDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
        
        // Guard against invalid dates
        if (!isNaN(createdAtDate.getTime())) {
          const ageInDays = (now.getTime() - createdAtDate.getTime()) / (1000 * 60 * 60 * 24);
          const ageRatio = Math.min(ageInDays / MAX_AGE_DAYS, 1); // Cap at 1.0
          freshnessFactor = 1 - (AGE_WEIGHT * ageRatio);
        }
      }
      
      return {
        ...result,
        attachments: documentAttachments.get(result.documentId),
        originalScore: result.score,
        freshnessFactor,
        score: result.score * freshnessFactor, // Apply temporal decay
      };
    });
    
    // Re-sort by adjusted score (freshness-aware ranking)
    const enrichedResults = resultsWithFreshness.sort((a, b) => b.score - a.score);
    
    console.log(`[RAG] Search completed: ${results.length} results, ${documentAttachments.size} docs with attachments, freshness applied`);
    
    // Track namespace usage for telemetry
    if (options.namespaces && options.namespaces.length > 0) {
      for (const namespaceName of options.namespaces) {
        usageTracker.trackNamespaceSearch(
          namespaceName,
          namespaceName,
          { query, resultsCount: results.length }
        );
      }
    }
    
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
