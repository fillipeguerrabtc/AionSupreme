/**
 * WORKER ASSÍNCRONO - Sistema de Jobs para Deep Crawling
 */

import { db } from "../db";
import { linkCaptureJobs } from "../../shared/schema";
import { eq } from "drizzle-orm";
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
    const [job] = await db
      .select()
      .from(linkCaptureJobs)
      .where(eq(linkCaptureJobs.status, "pending"))
      .limit(1);

    if (!job) return;

    this.currentJobId = job.id;
    console.log(`[Worker] 📥 Job ${job.id}: ${job.url}`);

    try {
      await db.update(linkCaptureJobs).set({ 
        status: "running", 
        startedAt: new Date(),
        currentItem: "Iniciando..."
      }).where(eq(linkCaptureJobs.id, job.id));

      const metadata = job.metadata as any || {};
      const crawler = new DeepCrawler(job.url, {
        maxDepth: metadata.maxDepth || 5,
        maxPages: metadata.maxPages || 100,
        includeImages: metadata.includeImages !== false
      });

      const pages = await crawler.crawl();

      const updatedJob = await this.getJobStatus(job.id);
      if (updatedJob?.cancelled) {
        await db.update(linkCaptureJobs).set({
          status: "cancelled",
          completedAt: new Date()
        }).where(eq(linkCaptureJobs.id, job.id));
        return;
      }

      await db.update(linkCaptureJobs).set({
        currentItem: `Enviando ${pages.length} páginas...`,
        processedItems: pages.length,
        totalItems: pages.length,
        progress: 90
      }).where(eq(linkCaptureJobs.id, job.id));

      const crawlerService = new WebsiteCrawlerService();
      await crawlerService.sendConsolidatedToCuration(pages, metadata.namespace || 'kb/web', job.url);

      await db.update(linkCaptureJobs).set({
        status: "completed",
        progress: 100,
        currentItem: `✓ ${pages.length} páginas enviadas`,
        completedAt: new Date()
      }).where(eq(linkCaptureJobs.id, job.id));

      console.log(`[Worker] ✅ Job ${job.id} concluído`);
    } catch (error: any) {
      await db.update(linkCaptureJobs).set({
        status: "failed",
        errorMessage: error.message,
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
