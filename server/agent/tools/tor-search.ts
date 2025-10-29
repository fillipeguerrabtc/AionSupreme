import type { AgentObservation } from "../react-engine";
import axios from "axios";
import * as cheerio from "cheerio";

/**
 * TorSearch - Search deepweb/darknet using Tor network
 * 
 * This tool searches for content in the deep/dark web through Tor proxies
 * when content is censored or unavailable on regular internet.
 * 
 * NOTE: In production, this requires:
 * 1. Tor service running (apt-get install tor)
 * 2. SOCKS proxy configured (default: localhost:9050)
 * 3. Onion search engines accessible
 * 
 * For development: Uses clearnet onion search engine mirrors as fallback
 */

interface TorSearchResult {
  title: string;
  url: string;
  snippet: string;
  isTorSite: boolean;
}

export async function torSearch(input: { 
  query: string; 
  maxResults?: number;
  useTorProxy?: boolean; // If false, uses clearnet mirror
}): Promise<AgentObservation> {
  try {
    const maxResults = input.maxResults || 5;
    
    // Check if Tor proxy is available
    const torProxyAvailable = await checkTorProxy();
    const useTor = input.useTorProxy && torProxyAvailable;
    
    if (input.useTorProxy && !torProxyAvailable) {
      console.log('[TorSearch] Tor proxy not available, falling back to clearnet mirror');
    }
    
    // Onion search engines (clearnet mirrors for development)
    const searchEngines = [
      // Ahmia - popular onion search engine with clearnet mirror
      `https://ahmia.fi/search/?q=${encodeURIComponent(input.query)}`,
      // Torch - another popular onion search (note: may not always be accessible)
      // We'll use Ahmia as primary for reliability
    ];
    
    const results: TorSearchResult[] = [];
    
    for (const searchUrl of searchEngines) {
      if (results.length >= maxResults) break;
      
      try {
        const response = await axios.get(searchUrl, {
          headers: { 
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
          },
          timeout: 20000,
          // If Tor proxy available, use SOCKS proxy
          ...(useTor && {
            proxy: false,
            httpsAgent: new (require('https-proxy-agent'))('socks5h://127.0.0.1:9050')
          })
        });
        
        const $ = cheerio.load(response.data);
        
        // Parse Ahmia results
        $('.result').each((i, elem) => {
          if (results.length >= maxResults) return false;
          
          const titleElem = $(elem).find('h4 a');
          const snippetElem = $(elem).find('p');
          const url = titleElem.attr('href');
          
          if (url) {
            results.push({
              title: titleElem.text().trim(),
              url: url,
              snippet: snippetElem.text().trim(),
              isTorSite: url.endsWith('.onion'),
            });
          }
        });
      } catch (error: any) {
        console.error(`[TorSearch] Failed to search ${searchUrl}:`, error.message);
        continue;
      }
    }
    
    if (results.length === 0) {
      return {
        observation: "No results found on Tor/Deep Web. This may be because:\n" +
          "1. Content is not indexed on deep web search engines\n" +
          "2. Tor proxy is not configured (for .onion sites)\n" +
          "3. Search query needs to be more specific\n\n" +
          "Recommendation: Try regular web search or adjust query.",
        success: true,
        metadata: { resultsCount: 0, torProxyAvailable },
      };
    }
    
    const formatted = results.map((r, i) => 
      `[${i+1}] ${r.title}\n` +
      `URL: ${r.url}${r.isTorSite ? ' (⚠️ Tor required)' : ''}\n` +
      `Snippet: ${r.snippet}`
    ).join('\n\n');
    
    return {
      observation: `🕵️ Found ${results.length} results on Deep Web:\n\n${formatted}\n\n` +
        (results.some(r => r.isTorSite) 
          ? "⚠️ Some results require Tor browser to access .onion sites." 
          : "ℹ️ All results accessible via regular browsers."),
      success: true,
      metadata: { 
        resultsCount: results.length, 
        torSitesCount: results.filter(r => r.isTorSite).length,
        torProxyAvailable,
      },
    };
  } catch (error: any) {
    return {
      observation: `Tor/Deep Web search failed: ${error.message}\n\n` +
        "This is expected in development without Tor configured. " +
        "Content may still be available via regular web search.",
      success: false,
      errorMessage: error.message,
    };
  }
}

async function checkTorProxy(): Promise<boolean> {
  try {
    // Try to connect to Tor SOCKS proxy
    const testResponse = await axios.get('http://check.torproject.org', {
      timeout: 5000,
      proxy: false,
      httpsAgent: new (require('https-proxy-agent'))('socks5h://127.0.0.1:9050')
    });
    return testResponse.data.includes('Congratulations');
  } catch (error) {
    return false;
  }
}
