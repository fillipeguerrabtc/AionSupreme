import type { AgentObservation } from "../react-engine";
import axios from "axios";
import * as cheerio from "cheerio";
import { trackTokenUsage } from "../../monitoring/token-tracker";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(input: { 
  query: string; 
  maxResults?: number;
  fetchContent?: boolean; // NEW: fetch full page content
  tenantId?: number; // For tracking
}): Promise<AgentObservation> {
  const tenantId = input.tenantId || 1; // Default tenant
  
  try {
    const maxResults = input.maxResults || 5;
    
    // Search DuckDuckGo for URLs
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
    const response = await axios.get(searchUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];
    
    // Extract results with URLs
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
      
      if (href && href.startsWith('http') && !href.includes('duckduckgo.com')) {
        results.push({
          title: titleElem.text().trim(),
          url: href,
          snippet: snippetElem.text().trim(),
        });
      }
    });
    
    if (results.length === 0) {
      // Track failed search
      await trackTokenUsage({
        tenantId,
        provider: 'web',
        model: 'duckduckgo-search',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        requestType: 'search',
        success: false,
        metadata: {
          query: input.query.substring(0, 200),
          sources: [],
          resultsCount: 0,
          indexedDocuments: 0
        }
      });
      
      return {
        observation: "No results found",
        success: true,
        metadata: { resultsCount: 0 },
      };
    }
    
    // If fetchContent is true, fetch full page content
    if (input.fetchContent) {
      const contentPromises = results.map(async (result) => {
        try {
          const pageResponse = await axios.get(result.url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 15000,
            maxRedirects: 5,
          });
          
          const page$ = cheerio.load(pageResponse.data);
          
          // Remove scripts, styles, nav, etc
          page$('script, style, nav, footer, header, aside, .ad, .advertisement, #comments').remove();
          
          // Extract main content
          const contentSelectors = ['article', 'main', '[role="main"]', '.content', '.main-content', '#content', 'body'];
          let content = '';
          for (const selector of contentSelectors) {
            const text = page$(selector).text();
            if (text && text.length > 100) {
              content = text;
              break;
            }
          }
          
          // Clean up
          content = content.replace(/\s+/g, ' ').trim();
          if (content.length > 5000) {
            content = content.slice(0, 5000) + '...';
          }
          
          return { ...result, content };
        } catch (error: any) {
          return { ...result, content: `Failed to fetch content: ${error.message}` };
        }
      });
      
      const resultsWithContent = await Promise.all(contentPromises);
      
      const formatted = resultsWithContent.map((r, i) => 
        `[${i+1}] ${r.title}\nURL: ${r.url}\nContent: ${r.content}\n`
      ).join('\n---\n\n');
      
      return {
        observation: `Found ${results.length} results with full content:\n\n${formatted}`,
        success: true,
        metadata: { resultsCount: results.length, urls: results.map(r => r.url) },
      };
    }
    
    // Otherwise just return titles and URLs
    const formatted = results.map((r, i) => 
      `[${i+1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`
    ).join('\n\n');
    
    // Track successful search
    await trackTokenUsage({
      tenantId,
      provider: 'web',
      model: 'duckduckgo-search',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestType: 'search',
      success: true,
      metadata: {
        query: input.query.substring(0, 200),
        sources: results.map(r => ({
          url: r.url,
          title: r.title,
          snippet: r.snippet,
          domain: new URL(r.url).hostname
        })),
        resultsCount: results.length,
        indexedDocuments: 0
      }
    });
    
    return {
      observation: `Found ${results.length} results:\n\n${formatted}`,
      success: true,
      metadata: { resultsCount: results.length, urls: results.map(r => r.url) },
    };
  } catch (error: any) {
    // Track error
    await trackTokenUsage({
      tenantId,
      provider: 'web',
      model: 'duckduckgo-search',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestType: 'search',
      success: false,
      metadata: {
        query: input.query.substring(0, 200),
        sources: [],
        resultsCount: 0,
        indexedDocuments: 0
      }
    });
    
    return {
      observation: `Search failed: ${error.message}`,
      success: false,
      errorMessage: error.message,
    };
  }
}
