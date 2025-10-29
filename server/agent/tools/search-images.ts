import type { AgentObservation } from "../react-engine";
import axios from "axios";
import * as cheerio from "cheerio";

interface ImageResult {
  title: string;
  url: string;
  snippet: string;
  thumbnail?: string;
  imageUrl?: string; // Direct image URL if available
}

/**
 * Search for images on the web
 */
export async function searchImages(input: { 
  query: string; 
  maxResults?: number;
}): Promise<AgentObservation> {
  try {
    const maxResults = input.maxResults || 12;
    
    // Search DuckDuckGo for image results
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query + " image")}`;
    const response = await axios.get(searchUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const results: ImageResult[] = [];
    
    // Extract results
    $('.result').each((i, elem) => {
      if (results.length >= maxResults) return false;
      
      const titleElem = $(elem).find('.result__a');
      const snippetElem = $(elem).find('.result__snippet');
      let href = titleElem.attr('href');
      
      // Extract actual URL from DDG redirect
      if (href && href.includes('uddg=')) {
        const match = href.match(/uddg=([^&]+)/);
        if (match) {
          href = decodeURIComponent(match[1]);
        }
      }
      
      // Filter for image URLs or image-related content
      if (href && href.startsWith('http') && !href.includes('duckduckgo.com')) {
        const isImageUrl = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(href);
        const hasImageKeyword = /(image|photo|picture|img)/i.test(titleElem.text() + snippetElem.text());
        
        if (isImageUrl || hasImageKeyword) {
          results.push({
            title: titleElem.text().trim(),
            url: href,
            snippet: snippetElem.text().trim(),
            imageUrl: isImageUrl ? href : undefined,
            thumbnail: isImageUrl ? href : undefined,
          });
        }
      }
    });
    
    if (results.length === 0) {
      return {
        observation: `Nenhuma imagem encontrada para "${input.query}"`,
        success: true,
        metadata: { 
          resultsCount: 0,
          query: input.query,
          contentType: "images",
        },
      };
    }
    
    // Format results for display
    const formattedResults = results.map((r, i) => 
      `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet.slice(0, 100)}...`
    ).join('\n\n');
    
    return {
      observation: `Encontrei ${results.length} imagens sobre "${input.query}":\n\n${formattedResults}`,
      success: true,
      metadata: { 
        resultsCount: results.length,
        results: results,
        query: input.query,
        contentType: "images",
      },
    };
  } catch (error: any) {
    return {
      observation: `Erro ao buscar imagens: ${error.message}`,
      success: false,
      errorMessage: error.message,
    };
  }
}
