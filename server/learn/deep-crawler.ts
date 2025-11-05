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
    localPath?: string;      // Deprecated - usado apenas para compatibilidade
    description?: string;
    filename?: string;       // Metadados do ImageProcessor
    mimeType?: string;       // Metadados do ImageProcessor  
    size?: number;           // Metadados do ImageProcessor
    base64?: string;         // NOVO: Buffer base64 para curadoria (ZERO BYPASS!)
    tempPath?: string;       // NOVO: Path temporário
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

  // ✅ CALLBACK: para worker reportar progresso e checar pause/cancel
  public onProgress?: (processed: number, total: number, currentUrl: string) => Promise<void>;

  constructor(startUrl: string, options?: CrawlerOptions) {
    this.baseUrl = new URL(startUrl);
    this.baseDomain = this.baseUrl.hostname;
    this.imageProcessor = new ImageProcessor();
    
    if (options) {
      this.options = { ...this.options, ...options };
    }
  }

  /**
   * Inicia o crawling profundo COM LOGS DETALHADOS
   */
  async crawl(): Promise<CrawledPage[]> {
    const startTime = Date.now();
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[DeepCrawler] 🚀 INICIANDO DEEP CRAWL`);
    console.log(`${'='.repeat(80)}`);
    console.log(`  URL Base: ${this.baseUrl.href}`);
    console.log(`  Configurações:`);
    console.log(`    • maxDepth: ${this.options.maxDepth} níveis`);
    console.log(`    • maxPages: ${this.options.maxPages} páginas`);
    console.log(`    • Processar imagens: ${this.options.includeImages ? 'SIM' : 'NÃO'}`);
    console.log(`    • Descrições Vision API: ${this.options.generateImageDescriptions ? 'SIM' : 'NÃO'}`);
    console.log(`${'='.repeat(80)}\n`);

    // Adiciona URL inicial à fila
    this.queue.push({ url: this.normalizeUrl(this.baseUrl.href), depth: 0 });
    const depthStats: Record<number, number> = {};

    while (this.queue.length > 0 && this.pages.length < this.options.maxPages) {
      const { url, depth } = this.queue.shift()!;

      // Pula se já visitado
      if (this.visited.has(url)) continue;
      
      // Pula se excedeu profundidade
      if (depth > this.options.maxDepth) {
        console.log(`[DeepCrawler] ⏭️ LIMITE DE PROFUNDIDADE (${depth} > ${this.options.maxDepth}): ${url}`);
        continue;
      }

      depthStats[depth] = (depthStats[depth] || 0) + 1;

      console.log(`\n[${this.pages.length + 1}/${this.options.maxPages}] 📄 CRAWLING`);
      console.log(`  URL: ${url}`);
      console.log(`  Profundidade: ${depth}/${this.options.maxDepth}`);
      console.log(`  Fila: ${this.queue.length} URLs pendentes`);

      // ✅ CALLBACK: reporta progresso ANTES de cada página
      if (this.onProgress) {
        try {
          const estimatedTotal = this.pages.length + this.queue.length + 1;
          await this.onProgress(this.pages.length, estimatedTotal, url);
        } catch (error: any) {
          // Se callback lançar erro (PAUSED/CANCELLED), propaga imediatamente
          throw error;
        }
      }

      try {
        const page = await this.crawlPage(url, depth);
        
        if (page) {
          this.pages.push(page);
          this.visited.add(url);

          console.log(`  ✅ SUCESSO:`);
          console.log(`     • ${page.metadata.wordCount.toLocaleString()} palavras`);
          console.log(`     • ${page.images.length} imagens`);
          console.log(`     • ${page.links.length} links descobertos`);

          if (page.links.length > 0) {
            console.log(`     📋 Links descobertos:`);
            page.links.slice(0, 10).forEach(l => console.log(`        - ${l}`));
            if (page.links.length > 10) {
              console.log(`        ... e mais ${page.links.length - 10} links`);
            }
          }

          // Adiciona links descobertos à fila
          let newLinksAdded = 0;
          let skippedVisited = 0;
          let skippedInQueue = 0;
          
          for (const link of page.links) {
            if (this.visited.has(link)) {
              skippedVisited++;
            } else if (this.queue.find(q => q.url === link)) {
              skippedInQueue++;
            } else {
              this.queue.push({ url: link, depth: depth + 1 });
              newLinksAdded++;
            }
          }
          
          if (newLinksAdded > 0) {
            console.log(`     ✅ ${newLinksAdded} novos links adicionados à fila`);
          }
          if (skippedVisited > 0) {
            console.log(`     ⏭️ ${skippedVisited} links já visitados`);
          }
          if (skippedInQueue > 0) {
            console.log(`     ⏭️ ${skippedInQueue} links já na fila`);
          }
        } else {
          console.log(`  ❌ FALHA ao extrair conteúdo`);
        }

        // Rate limiting: aguarda antes do próximo request
        if (this.queue.length > 0) {
          await sleep(this.options.delayMs);
        }

      } catch (error: any) {
        console.error(`  ❌ ERRO: ${error.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalImages = this.pages.reduce((sum, p) => sum + p.images.length, 0);
    const totalWords = this.pages.reduce((sum, p) => sum + p.metadata.wordCount, 0);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[DeepCrawler] ✅ CRAWL CONCLUÍDO EM ${duration}s`);
    console.log(`${'='.repeat(80)}`);
    console.log(`  Estatísticas Finais:`);
    console.log(`    • Páginas processadas: ${this.pages.length}/${this.options.maxPages}`);
    console.log(`    • URLs visitadas: ${this.visited.size}`);
    console.log(`    • URLs não processadas (fila): ${this.queue.length}`);
    console.log(`    • Total de palavras: ${totalWords.toLocaleString()}`);
    console.log(`    • Total de imagens: ${totalImages}`);
    console.log(`\n  Distribuição por Profundidade:`);
    
    Object.keys(depthStats).sort((a, b) => parseInt(a) - parseInt(b)).forEach(d => {
      const depth = parseInt(d);
      const count = depthStats[depth];
      const percentage = ((count / this.pages.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.ceil((count / this.pages.length) * 30));
      console.log(`    Nível ${depth}: ${count} páginas (${percentage}%) ${bar}`);
    });
    
    console.log(`${'='.repeat(80)}\n`);

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

    // Processa imagens (baixa e gera descrições) - ZERO BYPASS!
    if (this.options.generateImageDescriptions && images.length > 0) {
      console.log(`   🖼️ Processando ${images.length} imagens (CURADORIA - sem salvar)...`);
      
      for (const image of images) {
        try {
          // 🔥 ZERO BYPASS: Usa processImageForCuration (retorna base64, NÃO salva!)
          const result = await this.imageProcessor.processImageForCuration(image.url, image.alt);
          if (result) {
            // Armazena base64 + metadados (SEM localPath!)
            image.base64 = result.base64;
            image.description = result.description;
            image.filename = result.filename;
            image.mimeType = result.mimeType;
            image.size = result.size;
            
            console.log(`   ✓ Imagem processada (base64): ${result.filename}`);
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
