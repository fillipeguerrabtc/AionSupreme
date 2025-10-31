/**
 * DEEP WEB CRAWLER - Sistema de Aprendizado Profundo de Sites
 * 
 * Extrai TUDO de um site:
 * - Descobre todos os sublinks do mesmo domínio
 * - Extrai texto completo de cada página
 * - Baixa imagens importantes
 * - Gera descrições de imagens com Vision API
 * - Envia para curation queue (HITL)
 * 
 * FEATURES:
 * - Crawling recursivo (ilimitado em profundidade)
 * - Deduplicação de URLs
 * - Rate limiting (não sobrecarregar servidor)
 * - Extração inteligente de conteúdo
 * - Processamento de imagens com Vision API
 */

import * as cheerio from "cheerio";
import { URL } from "url";
import { sleep } from "../utils/sleep";
import { ImageProcessor } from "./image-processor";

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  images: Array<{
    url: string;
    alt: string;
    localPath?: string;
    description?: string;
  }>;
  links: string[];
  metadata: {
    crawledAt: string;
    depth: number;
    wordCount: number;
    imageCount: number;
  };
}

export interface CrawlerOptions {
  maxDepth?: number; // Default: ilimitado (999)
  maxPages?: number; // Default: ilimitado (9999)
  delayMs?: number; // Delay entre requests (rate limiting)
  includeImages?: boolean; // Processar imagens?
  generateImageDescriptions?: boolean; // Gerar descrições com Vision API?
  userAgent?: string;
}

export class DeepCrawler {
  private visited = new Set<string>();
  private queue: Array<{ url: string; depth: number }> = [];
  private pages: CrawledPage[] = [];
  private baseUrl: URL;
  private baseDomain: string;
  private imageProcessor: ImageProcessor;
  
  private options: Required<CrawlerOptions> = {
    maxDepth: 5,      // Profundidade de 5 níveis (ajustável via API)
    maxPages: 100,    // Até 100 páginas por site (ajustável via API)
    delayMs: 1000,    // 1 segundo entre requests
    includeImages: true,
    generateImageDescriptions: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  constructor(startUrl: string, options?: CrawlerOptions) {
    this.baseUrl = new URL(startUrl);
    this.baseDomain = this.baseUrl.hostname;
    this.imageProcessor = new ImageProcessor();
    
    if (options) {
      this.options = { ...this.options, ...options };
    }
  }

  /**
   * Inicia o crawling profundo
   */
  async crawl(): Promise<CrawledPage[]> {
    console.log(`[DeepCrawler] 🚀 Iniciando crawling: ${this.baseUrl.href}`);
    console.log(`[DeepCrawler] ⚙️ Configurações:`, {
      maxDepth: this.options.maxDepth,
      maxPages: this.options.maxPages,
      includeImages: this.options.includeImages,
      generateDescriptions: this.options.generateImageDescriptions
    });

    // Adiciona URL inicial à fila
    this.queue.push({ url: this.normalizeUrl(this.baseUrl.href), depth: 0 });

    while (this.queue.length > 0 && this.pages.length < this.options.maxPages) {
      const { url, depth } = this.queue.shift()!;

      // Pula se já visitado
      if (this.visited.has(url)) continue;
      
      // Pula se excedeu profundidade
      if (depth > this.options.maxDepth) {
        console.log(`[DeepCrawler] ⏭️ Profundidade máxima atingida: ${url}`);
        continue;
      }

      console.log(`[DeepCrawler] 📄 [${this.pages.length + 1}/${this.options.maxPages}] Depth ${depth}: ${url}`);

      try {
        const page = await this.crawlPage(url, depth);
        
        if (page) {
          this.pages.push(page);
          this.visited.add(url);

          // Adiciona links descobertos à fila
          for (const link of page.links) {
            if (!this.visited.has(link) && !this.queue.find(q => q.url === link)) {
              this.queue.push({ url: link, depth: depth + 1 });
            }
          }
        }

        // Rate limiting: aguarda antes do próximo request
        if (this.queue.length > 0) {
          await sleep(this.options.delayMs);
        }

      } catch (error: any) {
        console.error(`[DeepCrawler] ❌ Erro ao crawlear ${url}:`, error.message);
      }
    }

    console.log(`[DeepCrawler] ✅ Crawling concluído!`);
    console.log(`[DeepCrawler] 📊 Total de páginas: ${this.pages.length}`);
    console.log(`[DeepCrawler] 🖼️ Total de imagens: ${this.pages.reduce((sum, p) => sum + p.images.length, 0)}`);

    return this.pages;
  }

  /**
   * Crawl uma página específica
   */
  private async crawlPage(url: string, depth: number): Promise<CrawledPage | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.options.userAgent
        },
        signal: AbortSignal.timeout(30000) // 30s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extrai título
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Sem título';

      // Remove elementos desnecessários
      $('script, style, noscript, iframe').remove();

      // Extrai imagens importantes PRIMEIRO
      const images = await this.extractImages($, url);

      // Extrai conteúdo textual COM placeholders de imagens
      let content = this.extractContent($);
      
      // Substitui placeholders pelas descrições reais
      content = this.replaceImagePlaceholders(content, images);

      // Descobre links do mesmo domínio
      const links = this.extractLinks($, url);

      const page: CrawledPage = {
        url,
        title,
        content,
        images,
        links,
        metadata: {
          crawledAt: new Date().toISOString(),
          depth,
          wordCount: content.split(/\s+/).length,
          imageCount: images.length
        }
      };

      console.log(`   ✓ Título: ${title}`);
      console.log(`   ✓ Conteúdo: ${page.metadata.wordCount} palavras`);
      console.log(`   ✓ Imagens: ${images.length}`);
      console.log(`   ✓ Links encontrados: ${links.length}`);

      return page;

    } catch (error: any) {
      console.error(`[DeepCrawler] Erro ao processar ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Extrai conteúdo textual da página COM IMAGENS NO CONTEXTO CORRETO
   */
  private extractContent($: cheerio.CheerioAPI): string {
    // Remove elementos de navegação e publicidade
    $('nav, header, footer, aside, .ad, .advertisement, .cookie-banner, #comments').remove();

    // Tenta encontrar conteúdo principal
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '.post-content',
      '.entry-content',
      '#content',
      'body'
    ];

    let contentElement: cheerio.Cheerio<any> = $('body'); // Default
    
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        contentElement = element;
        break;
      }
    }

    // Extrai texto E marca posições das imagens com placeholders únicos
    let content = this.extractTextWithImagePlaceholders(contentElement);

    // Limpa whitespace excessivo (mas preserva quebras de linha dos placeholders)
    content = content
      .replace(/[ \t]+/g, ' ') // Colapsa espaços/tabs mas não quebras de linha
      .replace(/\n{3,}/g, '\n\n') // Máximo 2 quebras de linha consecutivas
      .trim();

    return content;
  }

  /**
   * Extrai texto e insere placeholders para imagens
   */
  private extractTextWithImagePlaceholders(element: cheerio.Cheerio<any>): string {
    let result = '';
    
    element.contents().each((_, node) => {
      if (node.type === 'text') {
        result += node.data;
      } else if (node.type === 'tag') {
        const $node = element.find(node as any).first();
        
        if (node.name === 'img') {
          // Marca posição da imagem com placeholder único
          const src = $node.attr('src') || $node.attr('data-src') || '';
          result += `\n[IMAGE:${src}]\n`;
        } else if (node.name === 'br') {
          result += '\n';
        } else if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(node.name || '')) {
          // Elementos de bloco: adiciona quebra de linha
          result += '\n' + this.extractTextWithImagePlaceholders($node) + '\n';
        } else {
          // Inline elements: processa recursivamente
          result += this.extractTextWithImagePlaceholders($node);
        }
      }
    });
    
    return result;
  }

  /**
   * Extrai imagens importantes da página
   */
  private async extractImages($: cheerio.CheerioAPI, pageUrl: string): Promise<CrawledPage['images']> {
    if (!this.options.includeImages) return [];

    const images: CrawledPage['images'] = [];
    const imgElements = $('img');

    for (let i = 0; i < imgElements.length; i++) {
      const img = imgElements.eq(i);
      const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src');
      
      if (!src) continue;

      // Resolve URL relativa
      const imageUrl = this.resolveUrl(src, pageUrl);
      
      // Ignora imagens muito pequenas (ícones, pixels de tracking)
      const width = parseInt(img.attr('width') || '0');
      const height = parseInt(img.attr('height') || '0');
      if ((width > 0 && width < 50) || (height > 0 && height < 50)) {
        continue;
      }

      // Ignora data URIs
      if (imageUrl.startsWith('data:')) continue;

      const alt = img.attr('alt') || '';

      images.push({
        url: imageUrl,
        alt
      });
    }

    // Processa imagens (baixa e gera descrições)
    if (this.options.generateImageDescriptions && images.length > 0) {
      console.log(`   🖼️ Processando ${images.length} imagens...`);
      
      for (const image of images) {
        try {
          const result = await this.imageProcessor.processImage(image.url, image.alt);
          if (result) {
            image.localPath = result.localPath;
            image.description = result.description;
          } else {
            // Se falhou ao processar, mantém pelo menos o alt text
            image.description = image.alt || 'Imagem sem descrição disponível';
            console.log(`   ⚠️ Mantendo imagem sem descrição: ${image.url}`);
          }
        } catch (error: any) {
          console.error(`   ⚠️ Erro ao processar imagem ${image.url}:`, error.message);
          // Mantém a imagem mesmo com erro
          image.description = image.alt || 'Erro ao processar imagem';
        }
      }
    } else if (!this.options.generateImageDescriptions && images.length > 0) {
      // Se não gera descrições, usa apenas alt text
      for (const image of images) {
        image.description = image.alt || 'Imagem sem descrição';
      }
    }

    return images;
  }

  /**
   * Extrai links do mesmo domínio
   */
  private extractLinks($: cheerio.CheerioAPI, pageUrl: string): string[] {
    const links: string[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      try {
        const absoluteUrl = this.resolveUrl(href, pageUrl);
        const url = new URL(absoluteUrl);

        // Apenas links do mesmo domínio
        if (url.hostname === this.baseDomain) {
          const normalized = this.normalizeUrl(absoluteUrl);
          
          if (!seen.has(normalized)) {
            seen.add(normalized);
            links.push(normalized);
          }
        }
      } catch (error) {
        // Ignora URLs inválidas
      }
    });

    return links;
  }

  /**
   * Resolve URL relativa para absoluta
   */
  private resolveUrl(url: string, baseUrl: string): string {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  }

  /**
   * Normaliza URL (remove fragments, ordena query params)
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      
      // Remove fragment (#)
      parsed.hash = '';
      
      // Remove trailing slash (exceto root)
      if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }

      return parsed.href;
    } catch {
      return url;
    }
  }

  /**
   * Substitui placeholders de imagens pelas descrições reais
   */
  private replaceImagePlaceholders(content: string, images: CrawledPage['images']): string {
    let result = content;
    
    for (const image of images) {
      const placeholder = `[IMAGE:${image.url}]`;
      
      if (result.includes(placeholder)) {
        // Substitui placeholder pela descrição formatada
        const replacement = image.description 
          ? `\n[IMAGEM: ${image.description}${image.alt ? ` (${image.alt})` : ''}]\n`
          : `\n[IMAGEM: ${image.alt || 'Sem descrição'}]\n`;
        
        result = result.replace(placeholder, replacement);
      }
    }
    
    return result;
  }

  /**
   * Retorna estatísticas do crawling
   */
  getStats() {
    const totalWords = this.pages.reduce((sum, p) => sum + p.metadata.wordCount, 0);
    const totalImages = this.pages.reduce((sum, p) => sum + p.images.length, 0);
    const imagesWithDescriptions = this.pages.reduce(
      (sum, p) => sum + p.images.filter(img => img.description).length,
      0
    );

    return {
      totalPages: this.pages.length,
      totalWords,
      totalImages,
      imagesWithDescriptions,
      averageWordsPerPage: Math.round(totalWords / this.pages.length),
      pagesVisited: this.visited.size,
      pagesInQueue: this.queue.length
    };
  }
}
