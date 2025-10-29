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
        observation: "No results found on Tor/Deep Web. This may be because:\n" +
          "1. Content is not indexed on deep web search engines\n" +
          "2. Tor proxy is not configured (for .onion sites)\n" +
          "3. Search query needs to be more specific\n\n" +
          "Recommendation: Try regular web search or adjust query.",
        success: false,
        metadata: { resultsCount: 0, torProxyAvailable, fallbackUsed: !useTor },
        errorMessage: "No deep web results found",
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
        fallbackUsed: !useTor,
        searchMethod: useTor ? "Tor SOCKS5 proxy" : "Ahmia clearnet mirror",
        results: results, // Include actual results for processing
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
