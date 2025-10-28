import type { AgentObservation } from "../react-engine";
import axios from "axios";

export async function searchWeb(input: { query: string; maxResults?: number }): Promise<AgentObservation> {
  try {
    // Using DuckDuckGo HTML scraping (free alternative to SerpAPI)
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
    const response = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000,
    });
    
    // Simple HTML parsing for results
    const results = response.data.match(/<a class="result__a"[^>]*>([^<]+)<\/a>/g) || [];
    const titles = results.slice(0, input.maxResults || 5).map((r: string) => r.replace(/<[^>]+>/g, ""));
    
    return {
      observation: titles.length > 0 
        ? `Found ${titles.length} results:\n${titles.join("\n")}` 
        : "No results found",
      success: true,
      metadata: { resultsCount: titles.length },
    };
  } catch (error: any) {
    return {
      observation: `Search failed: ${error.message}`,
      success: false,
      errorMessage: error.message,
    };
  }
}
