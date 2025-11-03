/**
 * AION Supreme - Web Search
 * DuckDuckGo HTML Scraping
 */

import * as cheerio from 'cheerio';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: 'duckduckgo';
}

export interface SearchOptions {
  limit?: number;
  timeout?: number;
}

// ============================================================================
// DUCKDUCKGO SEARCH
// ============================================================================

export async function searchWeb(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    limit = 10,
    timeout = 10000
  } = options;

  console.log(`[WebSearch] Searching for: "${query}" (limit: ${limit})`);

  try {
    // DuckDuckGo HTML search
    const results = await searchDuckDuckGo(query, limit, timeout);

    console.log(`[WebSearch] Found ${results.length} results`);
    return results;

  } catch (error: any) {
    console.error('[WebSearch] Search failed:', error.message);
    return [];
  }
}

async function searchDuckDuckGo(
  query: string,
  limit: number,
  timeout: number
): Promise<SearchResult[]> {
  
  const encodedQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const results: SearchResult[] = [];

    // Parse DuckDuckGo HTML results
    $('.result').each((_, element) => {
      const $result = $(element);
      
      const titleLink = $result.find('.result__a');
      const title = titleLink.text().trim();
      const href = titleLink.attr('href');
      
      const snippet = $result.find('.result__snippet').text().trim();

      if (title && href && snippet) {
        // Extract actual URL from DuckDuckGo redirect
        let url = href;
        try {
          const uddgMatch = href.match(/uddg=([^&]+)/);
          if (uddgMatch) {
            url = decodeURIComponent(uddgMatch[1]);
          }
        } catch (e) {
          // Keep original URL if parsing fails
        }

        results.push({
          title,
          snippet,
          url,
          source: 'duckduckgo'
        });
      }

      // Stop if we have enough results
      if (results.length >= limit) {
        return false;  // Break cheerio loop
      }
    });

    return results;

  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Search request timed out');
    }
    throw error;
  }
}

// ============================================================================
// WEB PAGE CONTENT FETCHER
// ============================================================================

export async function fetchPageContent(url: string): Promise<string | null> {
  try {
    console.log(`[WebFetch] Fetching ${url}...`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(15000)  // 15s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove script, style, and nav elements
    $('script, style, nav, header, footer, aside, .ad, .advertisement').remove();

    // Extract main content
    const bodyText = $('article, main, .content, .post, body')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    return bodyText.substring(0, 50000);  // Limit to 50k chars

  } catch (error: any) {
    console.error(`[WebFetch] Failed to fetch ${url}:`, error.message);
    return null;
  }
}
