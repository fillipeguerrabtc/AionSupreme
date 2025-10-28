import type { AgentObservation } from "../react-engine";
import { ragService } from "../../rag/vector-store";

export async function kbSearch(input: { query: string; k?: number; tenantId: number }): Promise<AgentObservation> {
  try {
    const results = await ragService.search(input.query, input.tenantId, { k: input.k || 5 });
    
    if (results.length === 0) {
      return {
        observation: "No relevant information found in knowledge base",
        success: true,
      };
    }
    
    const formatted = results.map((r, i) => `[${i+1}] (score: ${r.score.toFixed(3)}): ${r.chunkText.slice(0, 200)}...`).join("\n\n");
    
    return {
      observation: `Found ${results.length} relevant chunks:\n\n${formatted}`,
      success: true,
      metadata: { resultsCount: results.length },
    };
  } catch (error: any) {
    return {
      observation: `Knowledge base search failed: ${error.message}`,
      success: false,
      errorMessage: error.message,
    };
  }
}
