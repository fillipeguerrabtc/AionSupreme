import type { AgentObservation } from "../react-engine";
import axios from "axios";
import * as cheerio from "cheerio";

interface VideoResult {
  title: string;
  url: string;
  snippet: string;
  thumbnail?: string;
  duration?: string;
  source?: string; // "youtube" | "vimeo" | "dailymotion" | etc
}

/**
 * Search for videos on the web
 * Searches YouTube, Vimeo, Dailymotion, and general web
 */
export async function searchVideos(input: { 
  query: string; 
  maxResults?: number;
}): Promise<AgentObservation> {
  try {
    const maxResults = input.maxResults || 10;
    
    // Search DuckDuckGo for video results
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query + " video")}`;
    const response = await axios.get(searchUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const results: VideoResult[] = [];
    
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
      
      // Filter for video platforms
      if (href && href.startsWith('http') && !href.includes('duckduckgo.com')) {
        // Check if it's a video URL
        const isVideoUrl = /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|\.mp4|\.webm|\.mov/i.test(href);
        
        if (isVideoUrl || snippetElem.text().toLowerCase().includes('video') || snippetElem.text().toLowerCase().includes('vídeo')) {
          const source = extractVideoSource(href);
          const thumbnail = extractThumbnail(href, source);
          
          results.push({
            title: titleElem.text().trim(),
            url: href,
            snippet: snippetElem.text().trim(),
            thumbnail,
            source,
          });
        }
      }
    });
    
    if (results.length === 0) {
      return {
        observation: `Nenhum vídeo encontrado para "${input.query}"`,
        success: true,
        metadata: { 
          resultsCount: 0,
          query: input.query,
          contentType: "videos",
        },
      };
    }
    
    // Format results for display
    const formattedResults = results.map((r, i) => 
      `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet.slice(0, 100)}...`
    ).join('\n\n');
    
    return {
      observation: `Encontrei ${results.length} vídeos sobre "${input.query}":\n\n${formattedResults}`,
      success: true,
      metadata: { 
        resultsCount: results.length,
        results: results,
        query: input.query,
        contentType: "videos",
      },
    };
  } catch (error: any) {
    return {
      observation: `Erro ao buscar vídeos: ${error.message}`,
      success: false,
      errorMessage: error.message,
    };
  }
}

function extractVideoSource(url: string): string {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/vimeo\.com/i.test(url)) return "vimeo";
  if (/dailymotion\.com/i.test(url)) return "dailymotion";
  return "other";
}

function extractThumbnail(url: string, source: string): string | undefined {
  // YouTube thumbnail
  if (source === "youtube") {
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\?\/]+)/);
    if (videoIdMatch) {
      return `https://img.youtube.com/vi/${videoIdMatch[1]}/mqdefault.jpg`;
    }
  }
  
  // Vimeo thumbnail would require API call, skip for now
  // Dailymotion similar
  
  return undefined;
}
