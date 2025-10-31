/**
 * WEBSITE CRAWLER SERVICE - Serviço de aprendizado de sites completos
 * 
 * Integra Deep Crawler com sistema de curadoria (HITL)
 */

import { DeepCrawler, type CrawledPage } from "./deep-crawler";
import { db } from "../db";
import { curationQueue } from "@shared/schema";

export interface CrawlRequest {
  url: string;
  tenantId: number;
  namespace?: string;
  maxDepth?: number;
  maxPages?: number;
}

export interface CrawlResult {
  totalPages: number;
  totalWords: number;
  totalImages: number;
  imagesWithDescriptions: number;
  curationItemsCreated: number;
  duration: number;
}

export class WebsiteCrawlerService {
  
  /**
   * Inicia crawling profundo de um site
   * Envia todo conteúdo para curation queue (HITL)
   */
  async crawlWebsite(request: CrawlRequest): Promise<CrawlResult> {
    const startTime = Date.now();
    console.log(`[WebsiteCrawler] 🚀 Iniciando deep crawl: ${request.url}`);

    // Inicia crawler
    const crawler = new DeepCrawler(request.url, {
      maxDepth: request.maxDepth,
      maxPages: request.maxPages,
      includeImages: true,
      generateImageDescriptions: true
    });

    // Executa crawling
    const pages = await crawler.crawl();
    const stats = crawler.getStats();

    console.log(`[WebsiteCrawler] 📊 Crawling concluído:`, stats);

    // Envia cada página para curation queue
    let curationItemsCreated = 0;

    for (const page of pages) {
      try {
        await this.sendToCurationQueue(page, request.tenantId, request.namespace);
        curationItemsCreated++;
      } catch (error: any) {
        console.error(`[WebsiteCrawler] ❌ Erro ao enviar página ${page.url} para curadoria:`, error.message);
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[WebsiteCrawler] ✅ Processo concluído em ${(duration / 1000).toFixed(1)}s`);
    console.log(`[WebsiteCrawler] 📝 ${curationItemsCreated}/${pages.length} itens enviados para curadoria`);

    return {
      totalPages: stats.totalPages,
      totalWords: stats.totalWords,
      totalImages: stats.totalImages,
      imagesWithDescriptions: stats.imagesWithDescriptions,
      curationItemsCreated,
      duration
    };
  }

  /**
   * Envia página crawleada para curation queue
   */
  private async sendToCurationQueue(
    page: CrawledPage, 
    tenantId: number,
    namespace?: string
  ): Promise<void> {
    
    // Monta conteúdo completo: texto + descrições de imagens
    let fullContent = page.content;

    if (page.images.length > 0) {
      fullContent += '\n\n--- IMAGENS ENCONTRADAS ---\n';
      
      for (const img of page.images) {
        fullContent += `\n[Imagem: ${img.url}]\n`;
        if (img.description) {
          fullContent += `Descrição: ${img.description}\n`;
        }
        if (img.alt) {
          fullContent += `Alt text: ${img.alt}\n`;
        }
      }
    }

    // Tags automáticas
    const tags = [
      'url',
      'web-content',
      page.url,
      `quality-${this.calculateQualityScore(page)}`
    ];

    // Namespace sugerido
    const suggestedNamespaces = namespace ? [namespace] : ['kb/web'];

    // Insere na curation queue
    await db.insert(curationQueue).values({
      tenantId,
      title: page.title || 'Sem título',
      content: fullContent,
      suggestedNamespaces,
      tags,
      status: "pending",
      submittedBy: "website-crawler"
    } as any);

    console.log(`   ✓ Enviado para curadoria: "${page.title}"`);
  }

  /**
   * Calcula score de qualidade baseado em métricas da página
   */
  private calculateQualityScore(page: CrawledPage): number {
    const { wordCount, imageCount } = page.metadata;

    let score = 50; // Base

    // Mais palavras = melhor conteúdo
    if (wordCount > 500) score += 20;
    else if (wordCount > 200) score += 10;

    // Imagens relevantes = conteúdo rico
    if (imageCount > 5) score += 15;
    else if (imageCount > 2) score += 10;

    // Título presente
    if (page.title && page.title !== 'Sem título') score += 5;

    return Math.min(100, score);
  }
}

export const websiteCrawlerService = new WebsiteCrawlerService();
