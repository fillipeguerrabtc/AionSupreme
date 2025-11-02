/**
 * LINK INGESTION - Ingestão de Dados via URLs
 * 
 * Permite ao usuário enviar links (artigos, docs, papers) para treino.
 * 
 * FLUXO:
 * 1. Usuário envia URL
 * 2. Sistema scrape conteúdo (cheerio)
 * 3. Extrai texto limpo
 * 4. Envia para fila de curadoria HITL
 * 5. Após aprovação → adiciona ao dataset de treino
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { db } from "../db";
import { curationQueue } from "../../shared/schema";

interface LinkIngestionResult {
  success: boolean;
  title?: string;
  content?: string;
  wordCount?: number;
  curationId?: number;
  error?: string;
}

export class LinkIngestionService {
  /**
   * Ingerir conteúdo de uma URL
   */
  async ingestFromLink(url: string, userId?: string): Promise<LinkIngestionResult> {
    try {
      console.log(`[Link Ingestion] 📥 Processando: ${url}`);

      // 1. Baixar HTML
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AION-Bot/1.0)',
        },
        timeout: 30000, // 30s timeout
        maxContentLength: 10 * 1024 * 1024, // 10MB max
      });

      const html = response.data;

      // 2. Parsear HTML e extrair texto
      const $ = cheerio.load(html);

      // Remover scripts, styles, etc
      $('script, style, nav, footer, iframe, noscript').remove();

      // Extrair título
      const title = $('title').text().trim() || 
                    $('h1').first().text().trim() || 
                    'Sem título';

      // Extrair conteúdo principal (tenta vários seletores comuns)
      let content = '';
      
      const mainSelectors = [
        'article',
        'main',
        '[role="main"]',
        '.post-content',
        '.article-content',
        '.content',
        'body'
      ];

      for (const selector of mainSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          content = element.text();
          break;
        }
      }

      // Limpar texto
      content = content
        .replace(/\s+/g, ' ')  // Múltiplos espaços → 1 espaço
        .replace(/\n{3,}/g, '\n\n')  // Múltiplas quebras → 2 quebras
        .trim();

      const wordCount = content.split(/\s+/).length;

      // Validar conteúdo mínimo
      if (wordCount < 100) {
        return {
          success: false,
          error: `Conteúdo muito curto: ${wordCount} palavras (mínimo: 100)`,
        };
      }

      console.log(`   ✓ Extraído: "${title}" (${wordCount} palavras)`);

      // 3. Criar estrutura de treino (Q&A format)
      // Para cada parágrafo significativo, criar um par instruction/output
      const paragraphs = content
        .split(/\n\n+/)
        .filter(p => p.trim().length > 200); // Apenas parágrafos grandes

      const trainingData: Array<{instruction: string, output: string}> = [];

      // Criar pares de treino simples
      for (let i = 0; i < Math.min(paragraphs.length, 10); i++) {
        const para = paragraphs[i].trim();
        
        // Tentar criar uma pergunta baseada no conteúdo
        const instruction = `Explique sobre: ${title}`;
        const output = para;

        trainingData.push({ instruction, output });
      }

      // 4. Enviar para fila de curadoria
      const [curationEntry] = await db.insert(curationQueue).values({
        contentType: 'link',
        sourceUrl: url,
        title,
        content,
        metadata: {
          wordCount,
          trainingPairs: trainingData.length,
        },
        status: 'pending',
        submittedBy: userId || null,
        trainingData: trainingData as any,
      } as any).returning();

      console.log(`   ✅ Enviado para curadoria (ID: ${curationEntry.id})`);

      return {
        success: true,
        title,
        content,
        wordCount,
        curationId: curationEntry.id,
      };
    } catch (error: any) {
      console.error(`[Link Ingestion] ❌ Erro:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Ingerir múltiplas URLs em batch
   */
  async ingestBatch(urls: string[], userId?: string): Promise<LinkIngestionResult[]> {
    const results: LinkIngestionResult[] = [];

    for (const url of urls) {
      const result = await this.ingestFromLink(url, userId);
      results.push(result);
      
      // Aguardar 1s entre requests (rate limiting)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * Extrair apenas texto (sem salvar)
   */
  async extractText(url: string): Promise<{ title: string; content: string; wordCount: number } | null> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AION-Bot/1.0)',
        },
        timeout: 30000,
      });

      const $ = cheerio.load(response.data);
      $('script, style, nav, footer, iframe, noscript').remove();

      const title = $('title').text().trim() || 'Sem título';
      const content = $('article, main, body').first().text()
        .replace(/\s+/g, ' ')
        .trim();
      const wordCount = content.split(/\s+/).length;

      return { title, content, wordCount };
    } catch {
      return null;
    }
  }
}

// Singleton
export const linkIngestionService = new LinkIngestionService();
