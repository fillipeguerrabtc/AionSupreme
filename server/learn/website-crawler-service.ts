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
  namespace?: string;
  maxDepth?: number;
  maxPages?: number;
  consolidatePages?: boolean; // Se true, cria um único item de curadoria com todo o conteúdo
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
    const crawler = await DeepCrawler.create(request.url, {
      maxDepth: request.maxDepth,
      maxPages: request.maxPages,
      includeImages: true,
      generateImageDescriptions: true
    });

    // Executa crawling
    const pages = await crawler.crawl();
    const stats = crawler.getStats();

    console.log(`[WebsiteCrawler] 📊 Crawling concluído:`, stats);

    // Envia para curation queue
    let curationItemsCreated = 0;

    if (request.consolidatePages) {
      // MODO CONSOLIDADO: Cria um único item com todo o conteúdo
      try {
        await this.sendConsolidatedToCuration(pages, request.namespace, request.url);
        curationItemsCreated = 1;
        console.log(`[WebsiteCrawler] 📦 Site completo consolidado em 1 item de curadoria`);
      } catch (error: any) {
        console.error(`[WebsiteCrawler] ❌ Erro ao enviar conteúdo consolidado:`, error.message);
      }
    } else {
      // MODO SEPARADO: Uma página = um item de curadoria
      for (const page of pages) {
        try {
          await this.sendToCurationQueue(page, request.namespace);
          curationItemsCreated++;
        } catch (error: any) {
          console.error(`[WebsiteCrawler] ❌ Erro ao enviar página ${page.url} para curadoria:`, error.message);
        }
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

    // Converte imagens para formato de attachments (base64 temporário - ZERO BYPASS!)
    const attachments = page.images
      .filter(img => img.base64) // Apenas imagens que foram processadas com sucesso
      .map(img => ({
        type: 'image' as const,
        url: img.url, // URL original
        filename: img.filename || 'image.jpg',
        mimeType: img.mimeType || 'image/jpeg',
        size: img.size || 0,
        description: img.description,
        base64: img.base64 // NOVO: base64 temporário para curadoria
      }));

    // Tags automáticas
    const tags = [
      'url',
      'web-content',
      page.url,
      `quality-${this.calculateQualityScore(page)}`
    ];

    // Namespace sugerido
    const suggestedNamespaces = namespace ? [namespace] : ['kb/web'];

    // Insere na curation queue COM ATTACHMENTS
    await db.insert(curationQueue).values({
      title: page.title || 'Sem título',
      content: fullContent,
      suggestedNamespaces,
      tags,
      attachments: attachments.length > 0 ? attachments : undefined,
      status: "pending",
      submittedBy: "website-crawler"
    } as any);

    console.log(`   ✓ Enviado para curadoria: "${page.title}" (${attachments.length} imagens anexas)`);

    // NOVO: Cria item de curadoria INDIVIDUAL para CADA imagem (ZERO BYPASS!)
    // Isso permite aprovação/rejeição granular de cada imagem
    for (const img of page.images.filter(i => i.base64)) {
      try {
        const imageAttachment = {
          type: 'image' as const,
          url: img.url, // URL original
          filename: img.filename || 'image.jpg',
          mimeType: img.mimeType || 'image/jpeg',
          size: img.size || 0,
          description: img.description,
          base64: img.base64 // NOVO: base64 temporário
        };

        await db.insert(curationQueue).values({
          title: `[IMAGEM] ${img.filename || img.alt || 'Imagem sem título'}`,
          content: `**Fonte:** ${page.title || page.url}\n**URL Original:** ${img.url}\n\n**Descrição AI:** ${img.description || 'Sem descrição'}\n\n**Alt Text:** ${img.alt || 'Sem alt text'}`,
          suggestedNamespaces: namespace ? [namespace, 'kb/images'] : ['kb/images'],
          tags: ['imagem', 'crawler', page.url, img.mimeType || 'image/jpeg'],
          attachments: [imageAttachment],
          status: "pending",
          submittedBy: "image-crawler"
        } as any);

        console.log(`   🖼️ Imagem enviada para curadoria: "${img.filename}"`);
      } catch (error: any) {
        console.error(`   ⚠️ Erro ao enviar imagem ${img.filename} para curadoria:`, error.message);
      }
    }
  }

  /**
   * Envia todas as páginas consolidadas em um único item de curadoria
   * PUBLIC para uso no worker assíncrono
   */
  public async sendConsolidatedToCuration(
    pages: CrawledPage[],
    namespace?: string,
    baseUrl?: string
  ): Promise<void> {
    
    // Título geral do site
    const siteTitle = pages[0]?.title || 'Site completo';
    const siteDomain = baseUrl ? new URL(baseUrl).hostname : 'desconhecido';
    
    // Monta conteúdo consolidado
    let consolidatedContent = `# ${siteTitle}\n\n`;
    consolidatedContent += `**Domínio:** ${siteDomain}\n`;
    consolidatedContent += `**Total de páginas:** ${pages.length}\n`;
    consolidatedContent += `**Data do crawling:** ${new Date().toISOString()}\n\n`;
    consolidatedContent += `---\n\n`;

    // Adiciona cada página como seção
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      
      consolidatedContent += `## Página ${i + 1}: ${page.title || 'Sem título'}\n\n`;
      consolidatedContent += `**URL:** ${page.url}\n\n`;
      consolidatedContent += `### Conteúdo\n\n${page.content}\n\n`;

      // Adiciona imagens desta página
      if (page.images.length > 0) {
        consolidatedContent += `### Imagens (${page.images.length})\n\n`;
        
        for (const img of page.images) {
          consolidatedContent += `- **Imagem:** ${img.url}\n`;
          if (img.description) {
            consolidatedContent += `  **Descrição:** ${img.description}\n`;
          }
          if (img.alt) {
            consolidatedContent += `  **Alt:** ${img.alt}\n`;
          }
          consolidatedContent += `\n`;
        }
      }

      consolidatedContent += `---\n\n`;
    }

    // Coleta TODAS as imagens de todas as páginas (base64 temporário - ZERO BYPASS!)
    const allAttachments = pages.flatMap(page => 
      page.images
        .filter(img => img.base64)
        .map(img => ({
          type: 'image' as const,
          url: img.url, // URL original
          filename: img.filename || 'image.jpg',
          mimeType: img.mimeType || 'image/jpeg',
          size: img.size || 0,
          description: img.description,
          base64: img.base64 // NOVO: base64 temporário
        }))
    );

    // NOVO: Cria item de curadoria INDIVIDUAL para CADA imagem (modo consolidado - ZERO BYPASS!)
    for (const page of pages) {
      for (const img of page.images.filter(i => i.base64)) {
        try {
          const imageAttachment = {
            type: 'image' as const,
            url: img.url, // URL original
            filename: img.filename || 'image.jpg',
            mimeType: img.mimeType || 'image/jpeg',
            size: img.size || 0,
            description: img.description,
            base64: img.base64 // NOVO: base64 temporário
          };

          await db.insert(curationQueue).values({
            title: `[IMAGEM] ${img.filename || img.alt || 'Imagem sem título'}`,
            content: `**Fonte:** ${page.title || page.url}\n**URL Original:** ${img.url}\n\n**Descrição AI:** ${img.description || 'Sem descrição'}\n\n**Alt Text:** ${img.alt || 'Sem alt text'}`,
            suggestedNamespaces: namespace ? [namespace, 'kb/images'] : ['kb/images'],
            tags: ['imagem', 'crawler-consolidado', page.url, img.mimeType || 'image/jpeg'],
            attachments: [imageAttachment],
            status: "pending",
            submittedBy: "image-crawler-consolidated"
          } as any);

          console.log(`   🖼️ Imagem enviada para curadoria: "${img.filename}"`);
        } catch (error: any) {
          console.error(`   ⚠️ Erro ao enviar imagem ${img.filename} para curadoria:`, error.message);
        }
      }
    }

    // Tags automáticas
    const tags = [
      'website-completo',
      'multi-paginas',
      siteDomain,
      `pages-${pages.length}`,
      `images-${allAttachments.length}`,
      `quality-${this.calculateOverallQuality(pages)}`
    ];

    // Namespace sugerido
    const suggestedNamespaces = namespace ? [namespace] : ['kb/websites'];

    // Insere na curation queue COM ATTACHMENTS
    await db.insert(curationQueue).values({
      title: `${siteTitle} - ${siteDomain} (${pages.length} páginas)`,
      content: consolidatedContent,
      suggestedNamespaces,
      tags,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
      status: "pending",
      submittedBy: "website-crawler-consolidated"
    } as any);

    console.log(`   ✓ Site completo enviado para curadoria: "${siteTitle}" (${pages.length} páginas, ${allAttachments.length} imagens)`);
  }

  /**
   * Calcula qualidade geral de múltiplas páginas
   */
  private calculateOverallQuality(pages: CrawledPage[]): number {
    const scores = pages.map(p => this.calculateQualityScore(p));
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg);
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
