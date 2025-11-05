/**
 * WORKER ASSÍNCRONO - Sistema de Jobs para Deep Crawling
 * ✅ SUPORTA: pause/resume/cancel em tempo real
 * ✅ REPORTA: progress incremental por página
 */

import { db } from "../db";
import { linkCaptureJobs } from "../../shared/schema";
import { eq, inArray } from "drizzle-orm";
import { DeepCrawler } from "../learn/deep-crawler";
import { WebsiteCrawlerService } from "../learn/website-crawler-service";

class LinkCaptureWorker {
  private isRunning = false;
  private currentJobId: number | null = null;

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[Worker] 🚀 Link capture worker iniciado");

    while (this.isRunning) {
      try {
        await this.processNextJob();
      } catch (error: any) {
        console.error("[Worker] ❌ Erro:", error.message);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  stop() {
    this.isRunning = false;
  }

  private async processNextJob() {
    // Pega jobs pending OU running (para permitir resume)
    const [job] = await db
      .select()
      .from(linkCaptureJobs)
      .where(inArray(linkCaptureJobs.status, ["pending", "running"]))
      .limit(1);

    if (!job) return;

    this.currentJobId = job.id;

    // ✅ Referência ao crawler (fora do try/catch para acesso no catch)
    let currentCrawler: DeepCrawler | null = null;

    try {
      // Se job estava pending, marca como running
      if (job.status === "pending") {
        await db.update(linkCaptureJobs).set({ 
          status: "running", 
          startedAt: new Date(),
          currentItem: "Iniciando..."
        }).where(eq(linkCaptureJobs.id, job.id));
        console.log(`[Worker] 📥 Job ${job.id}: ${job.url}`);
      }

      const metadata = job.metadata as any || {};
      const crawler = new DeepCrawler(job.url, {
        maxDepth: metadata.maxDepth || 5,
        maxPages: metadata.maxPages || 100,
        includeImages: metadata.includeImages !== false
      });

      // Guarda referência para uso no catch
      currentCrawler = crawler;

      // ✅ CALLBACK: progress incremental
      crawler.onProgress = async (processed: number, total: number, currentUrl: string) => {
        const updatedJob = await this.getJobStatus(job.id);
        
        // ✅ CHECK: se job foi pausado/cancelado
        if (updatedJob?.status === "paused") {
          console.log(`[Worker] ⏸️  Job ${job.id} pausado pelo usuário`);
          throw new Error("PAUSED");
        }
        if (updatedJob?.status === "cancelled") {
          console.log(`[Worker] ❌ Job ${job.id} cancelado pelo usuário`);
          throw new Error("CANCELLED");
        }

        // ✅ UPDATE: progress em tempo real
        const progress = total > 0 ? Math.floor((processed / total) * 100) : 0;
        await db.update(linkCaptureJobs).set({
          processedItems: processed,
          totalItems: total,
          progress: Math.min(progress, 99), // Reserva 100% para conclusão
          currentItem: currentUrl
        }).where(eq(linkCaptureJobs.id, job.id));
      };

      // ✅ CRAWL: com callbacks de progress/cancellation
      const pages = await crawler.crawl();

      // ✅ UPDATE FINAL: garante que processedItems/totalItems refletem progresso real
      await db.update(linkCaptureJobs).set({
        processedItems: pages.length,
        totalItems: pages.length,
        progress: 90
      }).where(eq(linkCaptureJobs.id, job.id));

      // Checa status final antes de enviar para curadoria
      const finalJob = await this.getJobStatus(job.id);
      if (finalJob?.status === "cancelled") {
        await db.update(linkCaptureJobs).set({
          status: "cancelled",
          processedItems: pages.length,
          totalItems: pages.length,
          completedAt: new Date()
        }).where(eq(linkCaptureJobs.id, job.id));
        return;
      }

      // Envia consolidado para curadoria
      await db.update(linkCaptureJobs).set({
        currentItem: `Enviando ${pages.length} páginas para curadoria...`,
        progress: 95
      }).where(eq(linkCaptureJobs.id, job.id));

      const crawlerService = new WebsiteCrawlerService();
      await crawlerService.sendConsolidatedToCuration(pages, metadata.namespace || 'kb/web', job.url);

      // Completa job
      await db.update(linkCaptureJobs).set({
        status: "completed",
        progress: 100,
        processedItems: pages.length,
        totalItems: pages.length,
        currentItem: `✓ ${pages.length} páginas enviadas para curadoria`,
        completedAt: new Date()
      }).where(eq(linkCaptureJobs.id, job.id));

      console.log(`[Worker] ✅ Job ${job.id} concluído`);

    } catch (error: any) {
      // ✅ Pega páginas processadas até agora (do crawler original)
      const currentProgress = currentCrawler?.getStats().totalPages || 0;

      // Se foi pausado, mantém status paused com progresso atual
      if (error.message === "PAUSED") {
        await db.update(linkCaptureJobs).set({
          currentItem: "⏸️ Pausado pelo usuário",
          processedItems: currentProgress,
          totalItems: currentProgress
        }).where(eq(linkCaptureJobs.id, job.id));
        return;
      }

      // Se foi cancelado, marca como cancelled com progresso atual
      if (error.message === "CANCELLED") {
        await db.update(linkCaptureJobs).set({
          status: "cancelled",
          currentItem: "❌ Cancelado pelo usuário",
          processedItems: currentProgress,
          totalItems: currentProgress,
          completedAt: new Date()
        }).where(eq(linkCaptureJobs.id, job.id));
        return;
      }

      // Outros erros marcam como failed com progresso atual
      await db.update(linkCaptureJobs).set({
        status: "failed",
        errorMessage: error.message,
        processedItems: currentProgress,
        totalItems: currentProgress,
        completedAt: new Date()
      }).where(eq(linkCaptureJobs.id, job.id));
    }
  }

  private async getJobStatus(jobId: number) {
    const [job] = await db.select().from(linkCaptureJobs).where(eq(linkCaptureJobs.id, jobId)).limit(1);
    return job || null;
  }
}

export const linkCaptureWorker = new LinkCaptureWorker();
linkCaptureWorker.start();
