/**
 * ⚡ FASE 2 - C3: Rebuild Incremental Assíncrono
 * 
 * Sistema de background job para rebuild do índice vetorial
 * sem bloquear a API principal.
 * 
 * Features:
 * - Rebuild em chunks (não bloqueia)
 * - Progress tracking em tempo real
 * - Cancelamento gracioso
 * - PostgreSQL persistence
 * - Structured logging (Pino)
 */

import { db } from "../db";
import { rebuildJobs, documents } from "../../shared/schema";
import { eq } from "drizzle-orm";
import log from "../utils/logger";
import { vectorStore } from "../rag/vector-store";

interface RebuildStats {
  documentsIndexed: number;
  namespacesProcessed: string[];
  avgEmbeddingTime: number;
  totalDuration: number;
}

/**
 * Rebuild Service - Gerencia jobs de rebuild assíncronos
 */
class RebuildService {
  private jobQueue: number[] = []; // Fila de job IDs pendentes
  private activeJobId: number | null = null;
  private cancelSignal = false;
  private isProcessing = false;

  /**
   * Inicia novo rebuild job (enfileira se já existir job ativo)
   */
  async startRebuild(namespaceFilter?: string): Promise<number> {
    // Cria novo job (sempre aceita)
    const [job] = await db.insert(rebuildJobs).values({
      namespaceFilter: namespaceFilter || null,
      status: "pending",
    }).returning();

    console.log(
      { jobId: job.id, namespaceFilter, queueLength: this.jobQueue.length },
      "[RebuildService] Created rebuild job"
    );

    // Adiciona à fila
    this.jobQueue.push(job.id);

    // Inicia processamento da fila (se não estiver processando)
    if (!this.isProcessing) {
      this.processQueue().catch((error) => {
        console.error(
          { error: error.message },
          "[RebuildService] Queue processing failed"
        );
      });
    }

    return job.id;
  }

  /**
   * Processa fila de jobs sequencialmente
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return; // Já está processando
    }

    this.isProcessing = true;

    try {
      while (this.jobQueue.length > 0) {
        const jobId = this.jobQueue.shift()!; // Pega próximo job da fila

        console.log(
          { jobId, queueLength: this.jobQueue.length },
          "[RebuildService] Processing next job from queue"
        );

        await this.processRebuild(jobId);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Processa rebuild job (async background)
   */
  private async processRebuild(jobId: number): Promise<void> {
    this.activeJobId = jobId;
    this.cancelSignal = false;

    const startTime = Date.now();
    const stats: RebuildStats = {
      documentsIndexed: 0,
      namespacesProcessed: [],
      avgEmbeddingTime: 0,
      totalDuration: 0,
    };

    try {
      // Marca como running
      await db.update(rebuildJobs)
        .set({ 
          status: "running", 
          startedAt: new Date() 
        })
        .where(eq(rebuildJobs.id, jobId));

      console.log({ jobId }, "[RebuildService] Starting rebuild");

      // Obtém filtro de namespace
      const job = await db.query.rebuildJobs.findFirst({
        where: (t, { eq }) => eq(t.id, jobId),
      });

      if (!job) {
        throw new Error(`Job #${jobId} not found`);
      }

      // Rebuild incremental (em chunks para não bloquear)
      const result = await this.rebuildIncremental(
        jobId,
        job.namespaceFilter || undefined
      );

      // Atualiza stats
      stats.documentsIndexed = result.documentsIndexed;
      stats.namespacesProcessed = result.namespacesProcessed;
      stats.avgEmbeddingTime = result.avgEmbeddingTime;
      stats.totalDuration = Date.now() - startTime;

      // Marca como completed
      await db.update(rebuildJobs)
        .set({
          status: "completed",
          progress: 100,
          completedAt: new Date(),
          stats,
        })
        .where(eq(rebuildJobs.id, jobId));

      console.log(
        { jobId, stats },
        "[RebuildService] Rebuild completed successfully"
      );

    } catch (error: any) {
      console.error(
        { jobId, error: error.message },
        "[RebuildService] Rebuild failed"
      );

      await db.update(rebuildJobs)
        .set({
          status: "failed",
          errorMessage: error.message,
          completedAt: new Date(),
        })
        .where(eq(rebuildJobs.id, jobId));

    } finally {
      this.activeJobId = null;
    }
  }

  /**
   * Rebuild incremental em chunks (recarrega índice em memória)
   */
  private async rebuildIncremental(
    jobId: number,
    namespaceFilter?: string
  ): Promise<{
    documentsIndexed: number;
    namespacesProcessed: string[];
    avgEmbeddingTime: number;
  }> {
    let documentsIndexed = 0;
    const namespacesProcessed = new Set<string>();
    const indexTimes: number[] = [];

    // ⚡ Rebuild: recarrega embeddings em memória (com filtro de namespace se aplicável)
    
    const allDocuments = await db.query.documents.findMany({
      where: (t, { eq }) => eq(t.status, "indexed"),
    });

    // Filtra por namespace (se especificado)
    const filteredDocuments = namespaceFilter
      ? allDocuments.filter(doc => {
          const namespaces = (doc.metadata as any)?.namespaces as string[] | undefined;
          return namespaces && namespaces.includes(namespaceFilter);
        })
      : allDocuments;

    const totalDocs = filteredDocuments.length;

    console.log(
      { jobId, totalDocs, namespaceFilter, totalBeforeFilter: allDocuments.length },
      "[RebuildService] Found documents to rebuild"
    );

    // Atualiza total
    await db.update(rebuildJobs)
      .set({ totalDocuments: totalDocs })
      .where(eq(rebuildJobs.id, jobId));

    // Processa em chunks de 20 documentos
    const CHUNK_SIZE = 20;

    for (let i = 0; i < filteredDocuments.length; i += CHUNK_SIZE) {
      // Verifica cancelamento
      if (this.cancelSignal) {
        console.warn({ jobId }, "[RebuildService] Rebuild cancelled by user");
        throw new Error("Rebuild cancelled by user");
      }

      const chunk = filteredDocuments.slice(i, i + CHUNK_SIZE);

      // Processa chunk
      for (const doc of chunk) {
        const indexStart = Date.now();

        try {
          // Re-indexa documento (carrega embeddings do DB para memória)
          await vectorStore.indexDocument(doc.id);

          indexTimes.push(Date.now() - indexStart);
          documentsIndexed++;

          // Track namespaces (do metadata)
          const docNamespaces = (doc.metadata as any)?.namespaces as string[] | undefined;
          if (docNamespaces && Array.isArray(docNamespaces)) {
            docNamespaces.forEach(ns => namespacesProcessed.add(ns));
          }

        } catch (error: any) {
          console.warn(
            { jobId, docId: doc.id, error: error.message },
            "[RebuildService] Failed to re-index document"
          );
        }
      }

      // Atualiza progress
      const progress = Math.floor((documentsIndexed / totalDocs) * 100);
      const currentNamespace = Array.from(namespacesProcessed).join(", ");
      
      await db.update(rebuildJobs)
        .set({
          progress,
          processedDocuments: documentsIndexed,
          currentNamespace,
        })
        .where(eq(rebuildJobs.id, jobId));

      console.log(
        { jobId, progress, processedDocuments: documentsIndexed, totalDocs },
        "[RebuildService] Progress update"
      );

      // Yield control (permite outras operações)
      await new Promise(resolve => setImmediate(resolve));
    }

    const avgEmbeddingTime = indexTimes.length > 0
      ? indexTimes.reduce((a, b) => a + b, 0) / indexTimes.length
      : 0;

    return {
      documentsIndexed,
      namespacesProcessed: Array.from(namespacesProcessed),
      avgEmbeddingTime,
    };
  }

  /**
   * Obtém status do job
   */
  async getJobStatus(jobId: number) {
    const job = await db.query.rebuildJobs.findFirst({
      where: (t, { eq }) => eq(t.id, jobId),
    });

    if (!job) {
      return null;
    }

    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      totalDocuments: job.totalDocuments,
      processedDocuments: job.processedDocuments,
      currentNamespace: job.currentNamespace,
      errorMessage: job.errorMessage,
      stats: job.stats,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  /**
   * Cancela rebuild em progresso
   */
  async cancelRebuild(jobId: number): Promise<boolean> {
    const job = await db.query.rebuildJobs.findFirst({
      where: (t, { eq }) => eq(t.id, jobId),
    });

    if (!job) {
      return false;
    }

    if (job.status !== "running") {
      return false;
    }

    // Marca para cancelamento
    await db.update(rebuildJobs)
      .set({ cancelRequested: true })
      .where(eq(rebuildJobs.id, jobId));

    this.cancelSignal = true;

    console.log({ jobId }, "[RebuildService] Rebuild cancellation requested");

    return true;
  }

  /**
   * Lista todos os jobs de rebuild
   */
  async listJobs(limit = 50) {
    const jobs = await db.query.rebuildJobs.findMany({
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit,
    });

    return jobs.map(job => ({
      id: job.id,
      status: job.status,
      progress: job.progress,
      totalDocuments: job.totalDocuments,
      processedDocuments: job.processedDocuments,
      namespaceFilter: job.namespaceFilter,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      stats: job.stats,
    }));
  }
}

export const rebuildService = new RebuildService();
