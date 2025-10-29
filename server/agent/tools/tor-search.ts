import type { AgentObservation } from "../react-engine";
import axios from "axios";
import * as cheerio from "cheerio";
import { SocksProxyAgent } from 'socks-proxy-agent';

/**
 * TorSearch - Search deepweb/darknet using Tor network
 * 
 * This tool searches for content in the deep/dark web through multiple search engines:
 * - Ahmia.fi (clearnet + Tor)
 * - DarkSearch.io (20K+ onion sites indexed)
 * - Torch (400K+ pages)
 * 
 * NOTE: In production with Tor:
 * 1. Tor service running (apt-get install tor)
 * 2. SOCKS proxy configured (default: localhost:9050)
 * 3. Onion search engines accessible
 * 
 * For development/Replit: Uses clearnet mirrors that don't require Tor
 */

interface TorSearchResult {
  title: string;
  url: string;
  snippet: string;
  isTorSite: boolean;
  source: string;
}

export async function torSearch(input: { 
  query: string; 
  maxResults?: number;
  useTorProxy?: boolean; // If false, uses clearnet mirror
}): Promise<AgentObservation> {
  try {
    const maxResults = input.maxResults || 10;
    
    // Check if Tor proxy is available
    const torProxyAvailable = await checkTorProxy();
    const useTor = input.useTorProxy && torProxyAvailable;
    
    if (input.useTorProxy && !torProxyAvailable) {
      console.log('[TorSearch] Tor proxy not available, using clearnet mirrors');
    }
    
    const results: TorSearchResult[] = [];
    
    // Try DarkSearch.io first (most reliable, 20K+ onion sites)
    try {
      console.log('[TorSearch] Searching DarkSearch.io...');
      const darkSearchResults = await searchDarkSearch(input.query, maxResults, useTor);
      results.push(...darkSearchResults);
    } catch (error: any) {
      console.error('[TorSearch] DarkSearch failed:', error.message);
    }
    
    // If not enough results, try Ahmia
    if (results.length < maxResults) {
      try {
        console.log('[TorSearch] Searching Ahmia.fi...');
        const ahmiaResults = await searchAhmia(input.query, maxResults - results.length, useTor);
        results.push(...ahmiaResults);
      } catch (error: any) {
        console.error('[TorSearch] Ahmia failed:', error.message);
      }
    }
    
    if (results.length === 0) {
      return {
        observation: "No results found on Tor/Deep Web. Tried DarkSearch.io and Ahmia.fi.\n\n" +
          "Possible reasons:\n" +
          "1. Content not indexed on deep web search engines\n" +
          "2. Search engines temporarily unavailable\n" +
          "3. Query needs to be more specific\n\n" +
          "Recommendation: Try regular web search or rephrase query.",
        success: false,
        metadata: { 
          resultsCount: 0, 
          torProxyAvailable, 
          fallbackUsed: !useTor,
          searchEngines: ['DarkSearch.io', 'Ahmia.fi'],
          results: []
        },
        errorMessage: "No deep web results found",
      };
    }
    
    const formatted = results.map((r, i) => 
      `[${i+1}] ${r.title}\n` +
      `Source: ${r.source}\n` +
      `URL: ${r.url}${r.isTorSite ? ' (.onion - Tor required)' : ''}\n` +
      `Snippet: ${r.snippet}`
    ).join('\n\n');
    
    return {
      observation: `Found ${results.length} results on Deep Web:\n\n${formatted}\n\n` +
        (results.some(r => r.isTorSite) 
          ? "Note: Some .onion results require Tor browser to access." 
          : "All results accessible via regular browsers."),
      success: true,
      metadata: { 
        resultsCount: results.length, 
        torSitesCount: results.filter(r => r.isTorSite).length,
        torProxyAvailable,
        fallbackUsed: !useTor,
        searchMethod: useTor ? "Tor SOCKS5 proxy" : "Clearnet mirrors",
        searchEngines: ['DarkSearch.io', 'Ahmia.fi'],
        results: results,
      },
    };
  } catch (error: any) {
    return {
      observation: `Deep Web search error: ${error.message}\n\n` +
        "Tried DarkSearch.io and Ahmia.fi but both failed. " +
        "Try regular web search instead.",
      success: false,
      errorMessage: error.message,
      metadata: { results: [] }
    };
  }
}

// Search DarkSearch.io (20K+ onion sites indexed)
async function searchDarkSearch(query: string, maxResults: number, useTor: boolean): Promise<TorSearchResult[]> {
  const results: TorSearchResult[] = [];
  
  try {
    // DarkSearch API endpoint
    const searchUrl = `https://darksearch.io/api/search?query=${encodeURIComponent(query)}`;
    
    const config: any = {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
      },
      timeout: 15000,
    };
    
    if (useTor) {
      const agent = new SocksProxyAgent('socks5h://127.0.0.1:9050');
      config.httpsAgent = agent;
      config.proxy = false;
    }
    
    const response = await axios.get(searchUrl, config);
    const data = response.data;
    
    // DarkSearch returns JSON with results
    if (data && data.data && Array.isArray(data.data)) {
      for (const item of data.data.slice(0, maxResults)) {
        if (item.link && item.title) {
          results.push({
            title: item.title || 'Untitled',
            url: item.link,
            snippet: item.description || '',
            isTorSite: item.link.includes('.onion'),
            source: 'DarkSearch.io'
          });
        }
      }
    }
  } catch (error: any) {
    console.error('[DarkSearch] Error:', error.message);
  }
  
  return results;
}

// Search Ahmia.fi (clearnet mirror)
async function searchAhmia(query: string, maxResults: number, useTor: boolean): Promise<TorSearchResult[]> {
  const results: TorSearchResult[] = [];
  
  try {
    const searchUrl = `https://ahmia.fi/search/?q=${encodeURIComponent(query)}`;
    
    const config: any = {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 15000,
    };
    
    if (useTor) {
      const agent = new SocksProxyAgent('socks5h://127.0.0.1:9050');
      config.httpsAgent = agent;
      config.proxy = false;
    }
    
    const response = await axios.get(searchUrl, config);
    const $ = cheerio.load(response.data);
    
    // Updated Ahmia parser - try multiple selectors
    const selectors = [
      '.result',
      'li.result',
      'article',
      '.search-result'
    ];
    
    for (const selector of selectors) {
      if (results.length >= maxResults) break;
      
      $(selector).each((i, elem) => {
        if (results.length >= maxResults) return false;
        
        const $elem = $(elem);
        const titleElem = $elem.find('h4 a, h3 a, a[class*="title"], .title a').first();
        const snippetElem = $elem.find('p, .description, .snippet').first();
        const url = titleElem.attr('href') || $elem.find('a').first().attr('href');
        
        if (url && url.startsWith('http')) {
          results.push({
            title: titleElem.text().trim() || 'Untitled',
            url: url,
            snippet: snippetElem.text().trim() || '',
            isTorSite: url.includes('.onion'),
            source: 'Ahmia.fi'
          });
        }
      });
      
      if (results.length > 0) break; // Found results with this selector
    }
  } catch (error: any) {
    console.error('[Ahmia] Error:', error.message);
  }
  
  return results;
}

async function checkTorProxy(): Promise<boolean> {
  try {
    const agent = new SocksProxyAgent('socks5h://127.0.0.1:9050');
    const testResponse = await axios.get('http://check.torproject.org', {
      timeout: 5000,
      httpsAgent: agent,
      proxy: false
    });
    return testResponse.data.includes('Congratulations');
  } catch (error) {
    return false;
  }
}
