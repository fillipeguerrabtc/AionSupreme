/**
 * Hybrid Search - BM25 + Semantic + MMR Re-ranking
 * 
 * As per PDFs:
 * - score(q,c)=α·BM25(q,c)+(1-α)sim(q,c)
 * - Re-rank with MonoT5/LLM
 * - Max-Marginal Relevance (MMR) to avoid redundancy
 * - Chain-of-citation with IDs
 * - Coverage probability P(cover E)≈1-(1-p)^k
 */

import { vectorStore, type RAGService } from "./vector-store";
import { LLMClient } from "../model/llm-client";

interface HybridSearchResult {
  id: number;
  score: number;
  chunkText: string;
  documentId: number;
  metadata?: Record<string, any>;
  citationId?: string; // For chain-of-citation
}

/**
 * BM25 scoring (classic lexical search)
 * As per PDFs: Traditional IR method for lexical matching
 */
export class BM25 {
  private k1 = 1.5; // Term frequency saturation
  private b = 0.75;  // Length normalization
  
  /**
   * Calculate BM25 score
   * BM25(q,d) = Σ IDF(qi) · (f(qi,d)·(k1+1)) / (f(qi,d) + k1·(1-b+b·|d|/avgdl))
   */
  score(query: string, document: string, avgDocLength: number): number {
    const queryTerms = this.tokenize(query);
    const docTerms = this.tokenize(document);
    const docLength = docTerms.length;
    
    let totalScore = 0;
    
    for (const term of queryTerms) {
      const termFreq = docTerms.filter(t => t === term).length;
      
      if (termFreq === 0) continue;
      
      // Simplified IDF (would need corpus stats for true IDF)
      const idf = Math.log(1 + 1 / (termFreq + 1));
      
      const numerator = termFreq * (this.k1 + 1);
      const denominator = termFreq + this.k1 * (1 - this.b + this.b * docLength / avgDocLength);
      
      totalScore += idf * (numerator / denominator);
    }
    
    return totalScore;
  }

  /**
   * Simple tokenization (lowercase + split on non-alphanumeric)
   */
  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .split(/\W+/)
      .filter(t => t.length > 0);
  }
}

/**
 * Hybrid search combining lexical (BM25) and semantic (vector) search
 */
export class HybridSearch {
  private bm25 = new BM25();
  
  /**
   * Hybrid search with α weight
   * As per PDFs: score(q,c)=α·BM25(q,c)+(1-α)sim(q,c)
   */
  async search(
    query: string,
    semanticResults: HybridSearchResult[],
    alpha: number = 0.3 // Weight for BM25 (0.3 = 30% lexical, 70% semantic)
  ): Promise<HybridSearchResult[]> {
    if (semanticResults.length === 0) return [];
    
    // Calculate average document length
    const avgDocLength = semanticResults.reduce((sum, r) => sum + r.chunkText.split(/\W+/).length, 0) / semanticResults.length;
    
    // Re-score with hybrid approach
    const hybridResults = semanticResults.map(result => {
      const bm25Score = this.bm25.score(query, result.chunkText, avgDocLength);
      const semanticScore = result.score; // Already cosine similarity
      
      // Normalize BM25 to [0,1] range (rough approximation)
      const normalizedBM25 = Math.tanh(bm25Score / 10);
      
      // Hybrid score
      const hybridScore = alpha * normalizedBM25 + (1 - alpha) * semanticScore;
      
      return {
        ...result,
        score: hybridScore,
      };
    });
    
    // Sort by hybrid score
    hybridResults.sort((a, b) => b.score - a.score);
    
    return hybridResults;
  }

  /**
   * LLM-based re-ranking (MonoT5 style)
   * As per PDFs: s'(c)=LLM_Rerank(q,c)
   */
  async rerankWithLLM(
    query: string,
    results: HybridSearchResult[],
    topK: number = 10
  ): Promise<HybridSearchResult[]> {
    if (results.length === 0) return [];
    
    // Take top candidates for re-ranking (to save costs)
    const candidates = results.slice(0, Math.min(20, results.length));
    
    // Create policy-aware LLM client
    const client = await LLMClient.create();
    
    // Re-rank each candidate
    const reranked: Array<HybridSearchResult & { rerankScore: number }> = [];
    
    for (const candidate of candidates) {
      try {
        // Prompt LLM to score relevance
        const prompt = `Rate the relevance of the following passage to the query on a scale of 0-10.
Query: ${query}

Passage: ${candidate.chunkText.slice(0, 500)}

Respond with ONLY a number from 0-10:`;

        const response = await client.chatCompletion({
          messages: [{ role: "user", content: prompt }],
          model: "gpt-3.5-turbo", // Use cheaper model for re-ranking
          temperature: 0,
          maxTokens: 5,
        });
        
        const score = parseFloat(response.content.trim()) / 10; // Normalize to [0,1]
        
        reranked.push({
          ...candidate,
          rerankScore: isNaN(score) ? candidate.score : score,
        });
      } catch (error) {
        console.error("[HybridSearch] Re-ranking error:", error);
        reranked.push({
          ...candidate,
          rerankScore: candidate.score,
        });
      }
    }
    
    // Sort by rerank score
    reranked.sort((a, b) => b.rerankScore - a.rerankScore);
    
    // Return top-k
    return reranked.slice(0, topK);
  }

  /**
   * Max-Marginal Relevance (MMR) to reduce redundancy
   * As per PDFs: Select diverse results
   * MMR(c) = λ·sim(c,q) - (1-λ)·max_{c'∈S} sim(c,c')
   */
  maxMarginalRelevance(
    results: HybridSearchResult[],
    lambda: number = 0.7, // Trade-off between relevance and diversity
    k: number = 10
  ): HybridSearchResult[] {
    if (results.length === 0) return [];
    
    const selected: HybridSearchResult[] = [];
    const remaining = [...results];
    
    // Start with highest-scored result
    selected.push(remaining.shift()!);
    
    // Iteratively select diverse results
    while (selected.length < k && remaining.length > 0) {
      let bestIdx = 0;
      let bestMMR = -Infinity;
      
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        
        // Relevance score (already in result.score)
        const relevance = candidate.score;
        
        // Max similarity to already selected results
        let maxSimilarity = 0;
        for (const selectedResult of selected) {
          const similarity = this.textSimilarity(candidate.chunkText, selectedResult.chunkText);
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }
        
        // MMR score
        const mmr = lambda * relevance - (1 - lambda) * maxSimilarity;
        
        if (mmr > bestMMR) {
          bestMMR = mmr;
          bestIdx = i;
        }
      }
      
      // Add best candidate
      selected.push(remaining.splice(bestIdx, 1)[0]);
    }
    
    return selected;
  }

  /**
   * Simple text similarity (Jaccard coefficient)
   */
  private textSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(text1.toLowerCase().split(/\W+/));
    const tokens2 = new Set(text2.toLowerCase().split(/\W+/));
    
    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }

  /**
   * Add citation IDs for chain-of-citation
   * As per PDFs: Track source chunks
   */
  addCitations(results: HybridSearchResult[]): HybridSearchResult[] {
    return results.map((result, idx) => ({
      ...result,
      citationId: `[${idx + 1}]`,
    }));
  }

  /**
   * Format results with citations for LLM context
   * As per PDFs: X_final=[⟨CTX⟩,C*,⟨/CTX⟩,mensagem]
   */
  formatWithCitations(results: HybridSearchResult[]): string {
    const withCitations = this.addCitations(results);
    
    let formatted = "<CTX>\n\n";
    
    for (const result of withCitations) {
      formatted += `${result.citationId} ${result.chunkText}\n\n`;
    }
    
    formatted += "</CTX>";
    
    return formatted;
  }

  /**
   * Calculate coverage probability
   * As per PDFs: P(cover E)≈1-(1-p)^k
   */
  coverageProbability(p: number, k: number): number {
    return 1 - Math.pow(1 - p, k);
  }
}

// Singleton instance
export const hybridSearch = new HybridSearch();
